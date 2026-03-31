//+------------------------------------------------------------------+
//| VixTraderAI_EA.mq5                                               |
//| Poll Supabase instructions, execute trades, push realtime metrics |
//+------------------------------------------------------------------+
#property strict

#include <Trade/Trade.mqh>
CTrade trade;

//--- endpoints
input string ApiUrlInstructions  = "https://qqkhcvkodbogjsbichrw.supabase.co/functions/v1/mt5-get-instructions";
input string ApiUrlReportTrade   = "https://qqkhcvkodbogjsbichrw.supabase.co/functions/v1/mt5-report-trade";
input string ApiUrlReportAccount = "https://qqkhcvkodbogjsbichrw.supabase.co/functions/v1/mt5-report-account";
input string ApiUrlReportPos     = "https://qqkhcvkodbogjsbichrw.supabase.co/functions/v1/mt5-report-positions";

//--- auth (optional on backend; can be left empty while testing)
input string ApiToken            = "";

//--- timing
input int    PollIntervalSeconds = 5;   // also used as snapshot interval
input int    HttpTimeoutMs       = 5000;
input int    MaxSignalAgeSeconds = 900;   // align with server SIGNAL_INSTRUCTION_MAX_AGE_SECONDS (900); 0 = off
input double EntryMaxDeviationPoints = 150;

//--- execution
input int    SlippagePoints      = 20;
input int    MagicNumberBase     = 123456;
input bool   AllowNewTrades      = true;

//--- prevent duplicates in-session
string executedSignalIds[];

//--- mapping: position_ticket -> signal_id (in-memory)
long   mapTickets[];
string mapSignalIds[];
string mapSymbols[];
string mapDirections[];
double mapEntryPrices[];
double mapStopLosses[];
double mapTakeProfits[];
double mapLots[];

void Log(string msg) { Print("[VixTraderAI_EA] ", msg); }

bool IsDemoAccount()
{
  // ACCOUNT_TRADE_MODE: 0=real, 1=demo, 2=contest (broker-dependent)
  long mode = (long)AccountInfoInteger(ACCOUNT_TRADE_MODE);
  if(mode == 1 || mode == 2) return true;
  // Some brokers/bridges misreport trade mode; fall back to server name heuristic.
  string server = AccountInfoString(ACCOUNT_SERVER);
  if(StringFind(server, "Demo") >= 0 || StringFind(server, "DEMO") >= 0) return true;
  return false;
}

//+------------------------------------------------------------------+
string ExecGVKey(const string signal_id)
{
  return "VIX_EXEC_" + signal_id;
}

bool HasExecutedPersistent(const string signal_id)
{
  if(StringLen(signal_id)==0) return false;
  return GlobalVariableCheck(ExecGVKey(signal_id));
}

void MarkExecutedPersistent(const string signal_id)
{
  if(StringLen(signal_id)==0) return;
  GlobalVariableSet(ExecGVKey(signal_id), (double)TimeCurrent());
}

bool HasExecuted(const string signal_id)
{
  if(HasExecutedPersistent(signal_id)) return true;
  for(int i=0;i<ArraySize(executedSignalIds);i++)
    if(executedSignalIds[i]==signal_id) return true;
  return false;
}

void MarkExecuted(const string signal_id)
{
  if(HasExecuted(signal_id)) return;
  int n = ArraySize(executedSignalIds);
  ArrayResize(executedSignalIds, n+1);
  executedSignalIds[n]=signal_id;
  MarkExecutedPersistent(signal_id);
}

int FindTicketIndex(long ticket)
{
  for(int i=0;i<ArraySize(mapTickets);i++)
    if(mapTickets[i]==ticket) return i;
  return -1;
}

bool HasOpenPositionForSymbolMagic(const string symbol, const long magic)
{
  if(!PositionSelect(symbol)) return false;
  long m = (long)PositionGetInteger(POSITION_MAGIC);
  return (m == magic);
}

void MapTicketToSignal(long ticket, const string signal_id, const string symbol, const string direction, const double entry_price, const double sl, const double tp, const double lots)
{
  if(ticket<=0 || StringLen(signal_id)==0) return;
  int idx = FindTicketIndex(ticket);
  if(idx>=0)
  {
    mapSignalIds[idx]=signal_id;
    mapSymbols[idx]=symbol;
    mapDirections[idx]=direction;
    mapEntryPrices[idx]=entry_price;
    mapStopLosses[idx]=sl;
    mapTakeProfits[idx]=tp;
    mapLots[idx]=lots;
    return;
  }
  int n = ArraySize(mapTickets);
  ArrayResize(mapTickets, n+1);
  ArrayResize(mapSignalIds, n+1);
  ArrayResize(mapSymbols, n+1);
  ArrayResize(mapDirections, n+1);
  ArrayResize(mapEntryPrices, n+1);
  ArrayResize(mapStopLosses, n+1);
  ArrayResize(mapTakeProfits, n+1);
  ArrayResize(mapLots, n+1);
  mapTickets[n]=ticket;
  mapSignalIds[n]=signal_id;
  mapSymbols[n]=symbol;
  mapDirections[n]=direction;
  mapEntryPrices[n]=entry_price;
  mapStopLosses[n]=sl;
  mapTakeProfits[n]=tp;
  mapLots[n]=lots;
}

string GetSignalForTicket(long ticket)
{
  int idx = FindTicketIndex(ticket);
  if(idx<0) return "";
  return mapSignalIds[idx];
}

bool GetMappedTrade(long ticket, string &signal_id, string &symbol, string &direction, double &entry_price, double &sl, double &tp, double &lots)
{
  int idx = FindTicketIndex(ticket);
  if(idx<0) return false;
  signal_id = mapSignalIds[idx];
  symbol = mapSymbols[idx];
  direction = mapDirections[idx];
  entry_price = mapEntryPrices[idx];
  sl = mapStopLosses[idx];
  tp = mapTakeProfits[idx];
  lots = mapLots[idx];
  return true;
}

//+------------------------------------------------------------------+
//| JSON helpers (simple, tolerant)                                  |
//+------------------------------------------------------------------+
int FindKeyPos(const string json, const string key)
{
  string needle="\""+key+"\"";
  return StringFind(json, needle, 0);
}

bool ExtractStringField(const string json, const string key, string &out)
{
  int p = FindKeyPos(json, key);
  if(p<0) return false;
  p = StringFind(json, ":", p);
  if(p<0) return false;
  p++;
  while(p<StringLen(json))
  {
    ushort c=(ushort)StringGetCharacter(json,p);
    if(c==' '||c=='\r'||c=='\n'||c=='\t') p++; else break;
  }
  if(p>=StringLen(json) || StringGetCharacter(json,p)!='\"') return false;
  p++;
  int q = StringFind(json, "\"", p);
  if(q<0) return false;
  out = StringSubstr(json, p, q-p);
  return true;
}

bool ExtractNumberField(const string json, const string key, double &out)
{
  int p = FindKeyPos(json, key);
  if(p<0) return false;
  p = StringFind(json, ":", p);
  if(p<0) return false;
  p++;
  while(p<StringLen(json))
  {
    ushort c=(ushort)StringGetCharacter(json,p);
    if(c==' '||c=='\r'||c=='\n'||c=='\t') p++; else break;
  }
  int q=p;
  while(q<StringLen(json))
  {
    ushort c=(ushort)StringGetCharacter(json,q);
    if((c>='0'&&c<='9')||c=='-'||c=='+'||c=='.'||c=='e'||c=='E') q++; else break;
  }
  if(q<=p) return false;
  out = StringToDouble(StringSubstr(json,p,q-p));
  return true;
}

int ExtractInstructionObjects(const string json, string &objs[])
{
  ArrayResize(objs,0);
  int p = FindKeyPos(json, "instructions");
  if(p<0) return 0;
  p = StringFind(json, "[", p);
  if(p<0) return 0;
  int end = StringFind(json, "]", p);
  if(end<0) return 0;
  string arr = StringSubstr(json, p+1, end-(p+1));
  int i=0;
  while(i<StringLen(arr))
  {
    int a = StringFind(arr, "{", i);
    if(a<0) break;
    int depth=0;
    int b=a;
    for(; b<StringLen(arr); b++)
    {
      ushort c=(ushort)StringGetCharacter(arr,b);
      if(c=='{') depth++;
      else if(c=='}')
      {
        depth--;
        if(depth==0) { b++; break; }
      }
    }
    if(depth!=0) break;
    string obj = StringSubstr(arr, a, b-a);
    int n = ArraySize(objs);
    ArrayResize(objs, n+1);
    objs[n]=obj;
    i=b;
  }
  return ArraySize(objs);
}

//+------------------------------------------------------------------+
//| HTTP POST helper                                                 |
//+------------------------------------------------------------------+
bool HttpPost(const string url, const string body, string &response, int &http_status)
{
  string headers = "Content-Type: application/json\r\n";
  if(StringLen(ApiToken)>0)
    headers += "Authorization: Bearer " + ApiToken + "\r\n";

  uchar post[];
  StringToCharArray(body, post, 0, WHOLE_ARRAY, CP_UTF8);
  uchar result[];
  string result_headers="";

  ResetLastError();
  int status = WebRequest("POST", url, headers, HttpTimeoutMs, post, result, result_headers);
  if(status==-1)
  {
    int err=GetLastError();
    Log("WebRequest failed. Error=" + IntegerToString(err) + " (Whitelist host in MT5 Options -> Expert Advisors)");
    http_status = 0;
    response = "";
    return false;
  }

  http_status = status;
  response = CharArrayToString(result, 0, -1, CP_UTF8);
  return true;
}

//+------------------------------------------------------------------+
double ComputeLotsFromInstruction(const string symbol, const string lot_mode, const double fixed_lot, const double percent, const string percent_formula)
{
  if(lot_mode == "percent_balance")
  {
    // percent_formula currently supported: lots_per_1000
    // lot = (balance * percent/100) / 1000
    double bal = AccountInfoDouble(ACCOUNT_BALANCE);
    double p = MathMax(0.0, percent);
    if(percent_formula == "lots_per_1000" && bal > 0.0 && p > 0.0)
      return (bal * (p/100.0)) / 1000.0;
  }

  // Default to fixed-lot sizing (per-instruction)
  if(fixed_lot > 0.0) return fixed_lot;
  return 0.01;
}

double NormalizeLots(const string symbol, double lots)
{
  double minLot  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
  double maxLot  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
  double stepLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);

  lots = MathMax(lots, minLot);
  lots = MathMin(lots, maxLot);

  if(stepLot > 0.0)
    lots = MathFloor(lots/stepLot)*stepLot;

  if(lots < minLot) lots = minLot;
  return lots;
}

//+------------------------------------------------------------------+
void ReportTrade(const string signal_id, const long ticket, const string symbol, const string direction,
                 const string status, const double entry_price, const double sl, const double tp,
                 const double lots, const double profit, const double exit_price, const string error_message)
{
  string login = IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN));

  string body = "{"
    "\"mt5_login\":\""+login+"\","
    "\"ea_mode\":\"demo\","
    "\"signal_id\":\""+signal_id+"\","
    "\"ticket\":"+IntegerToString((int)ticket)+","
    "\"symbol\":\""+symbol+"\","
    "\"direction\":\""+direction+"\","
    "\"status\":\""+status+"\","
    "\"entry_price\":"+DoubleToString(entry_price, 5)+","
    "\"exit_price\":"+ (exit_price>0.0 ? DoubleToString(exit_price, 5) : "null") + ","
    "\"stop_loss\":"+DoubleToString(sl, 5)+","
    "\"take_profit\":"+DoubleToString(tp, 5)+","
    "\"lot_size\":"+DoubleToString(lots, 2)+","
    "\"profit\":"+DoubleToString(profit, 2)+","
    "\"error_message\":" + (StringLen(error_message) > 0 ? ("\"" + error_message + "\"") : "null") +
  "}";

  string resp; int st;
  HttpPost(ApiUrlReportTrade, body, resp, st);
}

//+------------------------------------------------------------------+
void PushAccountSnapshot()
{
  string login = IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN));
  double balance = AccountInfoDouble(ACCOUNT_BALANCE);
  double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
  double margin  = AccountInfoDouble(ACCOUNT_MARGIN);
  double free_m  = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
  double ml      = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);
  string currency = AccountInfoString(ACCOUNT_CURRENCY);
  long leverage = (long)AccountInfoInteger(ACCOUNT_LEVERAGE);

  string body = "{"
    "\"mt5_login\":\""+login+"\","
    "\"ea_mode\":\"demo\","
    "\"balance\":"+DoubleToString(balance, 2)+","
    "\"equity\":"+DoubleToString(equity, 2)+","
    "\"margin\":"+DoubleToString(margin, 2)+","
    "\"free_margin\":"+DoubleToString(free_m, 2)+","
    "\"margin_level\":"+DoubleToString(ml, 2)+","
    "\"currency\":\""+currency+"\","
    "\"leverage\":"+IntegerToString((int)leverage)+
  "}";

  string resp; int st;
  HttpPost(ApiUrlReportAccount, body, resp, st);
}

void PushPositionsSnapshot()
{
  string login = IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN));

  string positionsJson = "[";
  int total = PositionsTotal();
  for(int i=0;i<total;i++)
  {
    // MT5 doesn't provide PositionSelectByIndex; use ticket selection.
    ulong ticketU = (ulong)PositionGetTicket(i);
    if(ticketU == 0) continue;
    if(!PositionSelectByTicket(ticketU)) continue;

    long ticket = (long)PositionGetInteger(POSITION_TICKET);
    string symbol = PositionGetString(POSITION_SYMBOL);
    string comment = PositionGetString(POSITION_COMMENT);
    long type = (long)PositionGetInteger(POSITION_TYPE);
    string direction = (type==POSITION_TYPE_BUY ? "BUY" : "SELL");
    double volume = PositionGetDouble(POSITION_VOLUME);
    double price_open = PositionGetDouble(POSITION_PRICE_OPEN);
    double price_cur  = PositionGetDouble(POSITION_PRICE_CURRENT);
    double sl = PositionGetDouble(POSITION_SL);
    double tp = PositionGetDouble(POSITION_TP);
    double profit = PositionGetDouble(POSITION_PROFIT);
    datetime t = (datetime)PositionGetInteger(POSITION_TIME);
    string opened_at = TimeToString(t, TIME_DATE|TIME_MINUTES|TIME_SECONDS);

    if(StringLen(positionsJson) > 1) positionsJson += ",";
    positionsJson += "{"
      "\"ticket\":\""+IntegerToString((int)ticket)+"\","
      "\"symbol\":\""+symbol+"\","
      "\"comment\":\""+comment+"\","
      "\"direction\":\""+direction+"\","
      "\"volume\":"+DoubleToString(volume, 2)+","
      "\"price_open\":"+DoubleToString(price_open, 5)+","
      "\"price_current\":"+DoubleToString(price_cur, 5)+","
      "\"stop_loss\":"+DoubleToString(sl, 5)+","
      "\"take_profit\":"+DoubleToString(tp, 5)+","
      "\"profit\":"+DoubleToString(profit, 2)+","
      "\"opened_at\":\""+opened_at+"\""
    "}";
  }
  positionsJson += "]";

  // Also push recent closing deals (best-effort) so backend can reconcile closes even if OnTradeTransaction misses events.
  datetime nowT = TimeCurrent();
  datetime fromT = nowT - 3600; // last hour
  string dealsJson = "[";
  if(HistorySelect(fromT, nowT))
  {
    int dTotal = HistoryDealsTotal();
    for(int di=0; di<dTotal; di++)
    {
      ulong dealTicket = HistoryDealGetTicket(di);
      if(dealTicket == 0) continue;
      if(!HistoryDealSelect(dealTicket)) continue;
      long entry = (long)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT) continue;
      string dComment = HistoryDealGetString(dealTicket, DEAL_COMMENT);
      if(StringFind(dComment, "VIX_AI:") != 0) continue;
      string dSymbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
      double dProfit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
      double dPrice  = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
      datetime dTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
      long posId = (long)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);

      if(StringLen(dealsJson) > 1) dealsJson += ",";
      dealsJson += "{"
        "\"deal_ticket\":\""+IntegerToString((int)dealTicket)+"\","
        "\"position_id\":\""+IntegerToString((int)posId)+"\","
        "\"symbol\":\""+dSymbol+"\","
        "\"comment\":\""+dComment+"\","
        "\"profit\":"+DoubleToString(dProfit, 2)+","
        "\"exit_price\":"+DoubleToString(dPrice, 5)+","
        "\"closed_at\":\""+TimeToString(dTime, TIME_DATE|TIME_MINUTES|TIME_SECONDS)+"\""
      "}";
    }
  }
  dealsJson += "]";

  string body = "{"
    "\"mt5_login\":\""+login+"\","
    "\"ea_mode\":\"demo\","
    "\"positions\":"+positionsJson+","
    "\"deals\":"+dealsJson+
  "}";

  string resp; int st;
  HttpPost(ApiUrlReportPos, body, resp, st);
}

//+------------------------------------------------------------------+
void ExecuteInstruction(const string obj)
{
  string signal_id="", symbol="", direction="", entry_type="", comment="";
  string lot_mode="", percent_formula="";
  double entry_price=0.0, stop_loss=0.0, take_profit=0.0;
  double fixed_lot=0.0, percent=0.0;
  double magic_num=MagicNumberBase;

  if(!ExtractStringField(obj, "signal_id", signal_id)) return;
  if(HasExecuted(signal_id)) return;

  ExtractStringField(obj, "symbol", symbol);
  ExtractStringField(obj, "direction", direction);
  ExtractStringField(obj, "entry_type", entry_type);
  ExtractStringField(obj, "comment", comment);

  ExtractNumberField(obj, "entry_price", entry_price);
  ExtractNumberField(obj, "stop_loss", stop_loss);
  ExtractNumberField(obj, "take_profit", take_profit);
  ExtractNumberField(obj, "magic", magic_num);
  ExtractStringField(obj, "lot_mode", lot_mode);
  ExtractNumberField(obj, "fixed_lot", fixed_lot);
  ExtractNumberField(obj, "percent", percent);
  ExtractStringField(obj, "percent_formula", percent_formula);

  double signal_age_seconds = 0;
  ExtractNumberField(obj, "signal_age_seconds", signal_age_seconds);
  double is_retry_dispatch = 0;
  ExtractNumberField(obj, "is_retry_dispatch", is_retry_dispatch);
  double max_signal_age_seconds = -1.0;
  bool has_server_max_age = ExtractNumberField(obj, "max_signal_age_seconds", max_signal_age_seconds);
  int effective_max_signal_age = MaxSignalAgeSeconds;
  if(has_server_max_age && max_signal_age_seconds >= 0.0)
    effective_max_signal_age = (int)MathFloor(max_signal_age_seconds + 0.5);

  if(!AllowNewTrades) { Log("Trades disabled. Skipping " + signal_id); return; }
  if(symbol=="" || direction=="") { Log("Invalid instruction missing symbol/direction"); return; }
  if(stop_loss<=0.0 || take_profit<=0.0) { Log("Instruction missing SL/TP for " + signal_id); return; }

  // Safety: never open duplicates if there's already an open position on this symbol with our magic.
  // This also protects against EA re-init when you change inputs.
  if(HasOpenPositionForSymbolMagic(symbol, (long)magic_num))
  {
    Log("Position already open for " + symbol + " (magic=" + IntegerToString((int)magic_num) + "). Skipping signal " + signal_id);
    MarkExecuted(signal_id);
    return;
  }

  if(!SymbolSelect(symbol, true))
  {
    Log("Failed to select symbol " + symbol + " (check Market Watch name matches instruction)");
    return;
  }

  double ask = SymbolInfoDouble(symbol, SYMBOL_ASK);
  double bid = SymbolInfoDouble(symbol, SYMBOL_BID);

  double price = (direction=="BUY" ? ask : bid);

  if(effective_max_signal_age > 0 && is_retry_dispatch < 0.5 && signal_age_seconds > (double)effective_max_signal_age)
  {
    Log("Signal too old (" + DoubleToString(signal_age_seconds,0) + "s > " + IntegerToString(effective_max_signal_age) + "s). Skipping (will retry when server resends) " + signal_id);
    return;
  }

  if(EntryMaxDeviationPoints > 0.0 && entry_price > 0.0)
  {
    double pt = SymbolInfoDouble(symbol, SYMBOL_POINT);
    if(pt > 0.0)
    {
      double distPts = MathAbs(price - entry_price) / pt;
      if(distPts > EntryMaxDeviationPoints)
      {
        Log("Entry vs market too far (" + DoubleToString(distPts,1) + " pts > " + DoubleToString(EntryMaxDeviationPoints,1) + "). Skipping (no MarkExecuted; retry later) " + signal_id);
        return;
      }
    }
  }

  if(entry_price<=0.0) entry_price = price;

  double lots = ComputeLotsFromInstruction(symbol, lot_mode, fixed_lot, percent, percent_formula);
  lots = NormalizeLots(symbol, lots);

  int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
  stop_loss = NormalizeDouble(stop_loss, digits);
  take_profit = NormalizeDouble(take_profit, digits);

  trade.SetExpertMagicNumber((int)magic_num);
  trade.SetDeviationInPoints(SlippagePoints);

  bool ok=false;
  ResetLastError();

  if(direction=="BUY")
    ok = trade.Buy(lots, symbol, 0.0, stop_loss, take_profit, comment);
  else if(direction=="SELL")
    ok = trade.Sell(lots, symbol, 0.0, stop_loss, take_profit, comment);
  else
  {
    Log("Unknown direction: " + direction);
    return;
  }

  if(!ok)
  {
    int err=GetLastError();
    Log("Order failed for " + signal_id + " err=" + IntegerToString(err));
    ReportTrade(signal_id, 0, symbol, direction, "error", entry_price, stop_loss, take_profit, lots, 0.0, 0.0, IntegerToString(err));
    return;
  }

  // Try to map the resulting position ticket so we can report closes later
  long positionTicket = 0;
  if(PositionSelect(symbol))
    positionTicket = (long)PositionGetInteger(POSITION_TICKET);
  if(positionTicket > 0) MapTicketToSignal(positionTicket, signal_id, symbol, direction, entry_price, stop_loss, take_profit, lots);

  Log("Executed " + direction + " " + symbol + " position=" + IntegerToString((int)positionTicket) + " signal=" + signal_id);
  MarkExecuted(signal_id);
  ReportTrade(signal_id, positionTicket, symbol, direction, "opened", entry_price, stop_loss, take_profit, lots, 0.0, 0.0, "");
}

//+------------------------------------------------------------------+
void PollBackend()
{
  string login = IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN));
  string body  = "{"
    "\"mt5_login\":\""+login+"\","
    "\"ea_mode\":\"demo\","
    "\"max\":1000"
  "}";

  string resp; int st;
  if(!HttpPost(ApiUrlInstructions, body, resp, st)) return;
  if(st==401)
  {
    static datetime s_last401Log = 0;
    if(TimeCurrent() - s_last401Log >= 60)
    {
      string errMsg="";
      if(!ExtractStringField(resp, "error", errMsg) || StringLen(errMsg)==0)
        errMsg="Unauthorized";
      Log(errMsg + " (polling continues; add this MT5 login in the app if needed)");
      Alert(errMsg);
      s_last401Log = TimeCurrent();
    }
    return;
  }
  if(st!=200)
  {
    Log("Instructions HTTP status=" + IntegerToString(st) + " resp=" + resp);
    return;
  }

  string objs[];
  int n = ExtractInstructionObjects(resp, objs);
  for(int i=0;i<n;i++)
    ExecuteInstruction(objs[i]);
}

//+------------------------------------------------------------------+
int OnInit()
{
  Log("Init");
  long mode = (long)AccountInfoInteger(ACCOUNT_TRADE_MODE);
  string server = AccountInfoString(ACCOUNT_SERVER);
  Log("Account trade_mode=" + IntegerToString((int)mode) + " server=" + server);
  if(!IsDemoAccount())
  {
    Log("Unauthorized: VixAi-Trader.mq5 is DEMO-only. Attach it to a DEMO account.");
    return INIT_FAILED;
  }
  ArrayResize(executedSignalIds, 0);
  ArrayResize(mapTickets, 0);
  ArrayResize(mapSignalIds, 0);
  ArrayResize(mapSymbols, 0);
  ArrayResize(mapDirections, 0);
  ArrayResize(mapEntryPrices, 0);
  ArrayResize(mapStopLosses, 0);
  ArrayResize(mapTakeProfits, 0);
  ArrayResize(mapLots, 0);
  EventSetTimer(PollIntervalSeconds);
  return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
  EventKillTimer();
  Log("Deinit");
}

void OnTimer()
{
  // 1) Pull instructions
  PollBackend();
  // 2) Push realtime snapshots
  PushAccountSnapshot();
  PushPositionsSnapshot();
}

// Capture closes (realized P/L) and report to backend
void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
{
  if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;

  long deal = (long)trans.deal;
  if(deal <= 0) return;

  if(!HistoryDealSelect(deal)) return;

  long entry = (long)HistoryDealGetInteger(deal, DEAL_ENTRY);
  // We care about closing deals
  if(entry != DEAL_ENTRY_OUT) return;

  long posTicket = (long)trans.position;
  if(posTicket <= 0) posTicket = (long)HistoryDealGetInteger(deal, DEAL_POSITION_ID);

  string signal_id, mSymbol, mDirection;
  double entry_price, sl, tp, lots;
  if(!GetMappedTrade(posTicket, signal_id, mSymbol, mDirection, entry_price, sl, tp, lots)) return; // cannot link; requires mapping

  string symbol = HistoryDealGetString(deal, DEAL_SYMBOL);
  long dealType = (long)HistoryDealGetInteger(deal, DEAL_TYPE);
  string direction = (dealType==DEAL_TYPE_BUY ? "BUY" : "SELL");
  double profit = HistoryDealGetDouble(deal, DEAL_PROFIT);
  double price  = HistoryDealGetDouble(deal, DEAL_PRICE);

  // Report close with mapped entry/SL/TP/lots (captured on open)
  ReportTrade(signal_id, posTicket, symbol, direction, "closed", entry_price, sl, tp, lots, profit, price, "");
  Log("Reported close for position=" + IntegerToString((int)posTicket) + " profit=" + DoubleToString(profit,2));
}

void OnTick() {}

