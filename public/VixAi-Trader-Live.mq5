//+------------------------------------------------------------------+
//| VixAi-Trader-Live.mq5                                            |
//| Live-only EA build                                               |
//+------------------------------------------------------------------+
#property strict
#property copyright "Copyright 2026, Vix AI,"
#property link      "https://vixai.trade"
#property version   "1.00"
#property description "VixAI Copy Trader"
#property description "Advanced AI Copy Trading & Signal Platform for Deriv Volatility Index"

#include <Trade/Trade.mqh>

CTrade trade;

//--- endpoints
string ApiUrlInstructions  = "https://qqkhcvkodbogjsbichrw.supabase.co/functions/v1/mt5-get-instructions";
string ApiUrlReportTrade   = "https://qqkhcvkodbogjsbichrw.supabase.co/functions/v1/mt5-report-trade";
string ApiUrlReportAccount = "https://qqkhcvkodbogjsbichrw.supabase.co/functions/v1/mt5-report-account";
string ApiUrlReportPos     = "https://qqkhcvkodbogjsbichrw.supabase.co/functions/v1/mt5-report-positions";

//--- auth (optional on backend; can be left empty while testing)
string ApiToken            = "";

//--- timing
input int    PollIntervalSeconds = 5;   // also used as snapshot interval
input int    HttpTimeoutMs       = 5000;

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

void Log(string msg) { Print("[VixAi-Live] ", msg); }

bool IsLiveAccount()
{
  // ACCOUNT_TRADE_MODE: 0=real, 1=demo, 2=contest (broker-dependent)
  long mode = (long)AccountInfoInteger(ACCOUNT_TRADE_MODE);
  return (mode == 0);
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

double ComputeLotsFromInstruction(const string symbol, const string lot_mode, const double fixed_lot, const double percent, const string percent_formula)
{
  if(lot_mode == "percent_balance")
  {
    double bal = AccountInfoDouble(ACCOUNT_BALANCE);
    double p = MathMax(0.0, percent);
    if(percent_formula == "lots_per_1000" && bal > 0.0 && p > 0.0)
      return (bal * (p/100.0)) / 1000.0;
  }
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

// Ensure SL/TP satisfy broker minimum stop distance and side rules.
bool PrepareValidStops(const string symbol, const string direction, double &sl, double &tp)
{
  double ask = SymbolInfoDouble(symbol, SYMBOL_ASK);
  double bid = SymbolInfoDouble(symbol, SYMBOL_BID);
  double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
  int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
  int stopsLevel = (int)SymbolInfoInteger(symbol, SYMBOL_TRADE_STOPS_LEVEL);
  int freezeLevel = (int)SymbolInfoInteger(symbol, SYMBOL_TRADE_FREEZE_LEVEL);

  if(point <= 0.0) point = 0.00001;
  double minPoints = MathMax((double)stopsLevel, (double)freezeLevel);
  if(minPoints < 1.0) minPoints = 1.0; // keep a tiny safety buffer even when broker returns 0
  double minDist = minPoints * point;

  if(direction == "BUY")
  {
    double maxSl = bid - minDist;
    double minTp = ask + minDist;
    if(sl <= 0.0 || sl >= maxSl) sl = maxSl;
    if(tp <= 0.0 || tp <= minTp) tp = minTp;
  }
  else if(direction == "SELL")
  {
    double minSl = ask + minDist;
    double maxTp = bid - minDist;
    if(sl <= 0.0 || sl <= minSl) sl = minSl;
    if(tp <= 0.0 || tp >= maxTp) tp = maxTp;
  }
  else
  {
    return false;
  }

  sl = NormalizeDouble(sl, digits);
  tp = NormalizeDouble(tp, digits);

  // Final guard after normalization.
  if(direction == "BUY")
    return (sl < bid && tp > ask);
  return (sl > ask && tp < bid);
}

void ReportTrade(const string signal_id, const long ticket, const string symbol, const string direction,
                 const string status, const double entry_price, const double sl, const double tp,
                 const double lots, const double profit, const double exit_price, const string error_message)
{
  string login = IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN));
  string body = "{"
    "\"mt5_login\":\""+login+"\","
    "\"ea_mode\":\"live\","
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
    "\"ea_mode\":\"live\","
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

  datetime nowT = TimeCurrent();
  datetime fromT = nowT - 3600;
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
    "\"ea_mode\":\"live\","
    "\"positions\":"+positionsJson+","
    "\"deals\":"+dealsJson+
  "}";

  string resp; int st;
  HttpPost(ApiUrlReportPos, body, resp, st);
}

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

  if(!AllowNewTrades) { Log("Trades disabled. Skipping " + signal_id); return; }
  if(symbol=="" || direction=="") { Log("Invalid instruction missing symbol/direction"); return; }
  if(stop_loss<=0.0 || take_profit<=0.0) { Log("Instruction missing SL/TP for " + signal_id); return; }

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
  if(entry_price<=0.0) entry_price = price;

  double lots = ComputeLotsFromInstruction(symbol, lot_mode, fixed_lot, percent, percent_formula);
  lots = NormalizeLots(symbol, lots);

  double slRaw = stop_loss;
  double tpRaw = take_profit;
  if(!PrepareValidStops(symbol, direction, stop_loss, take_profit))
  {
    Log("Invalid SL/TP after broker normalization for " + symbol + " signal=" + signal_id);
    return;
  }
  if(MathAbs(stop_loss - slRaw) > 0.0 || MathAbs(take_profit - tpRaw) > 0.0)
    Log("Adjusted stops for broker rules: SL " + DoubleToString(slRaw, 5) + " -> " + DoubleToString(stop_loss, 5) +
        ", TP " + DoubleToString(tpRaw, 5) + " -> " + DoubleToString(take_profit, 5));

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

  long positionTicket = 0;
  if(PositionSelect(symbol))
    positionTicket = (long)PositionGetInteger(POSITION_TICKET);
  if(positionTicket > 0) MapTicketToSignal(positionTicket, signal_id, symbol, direction, entry_price, stop_loss, take_profit, lots);

  Log("Executed " + direction + " " + symbol + " position=" + IntegerToString((int)positionTicket) + " signal=" + signal_id);
  MarkExecuted(signal_id);
  ReportTrade(signal_id, positionTicket, symbol, direction, "opened", entry_price, stop_loss, take_profit, lots, 0.0, 0.0, "");
}

void PollBackend()
{
  string login = IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN));
  string body  = "{"
    "\"mt5_login\":\""+login+"\","
    "\"ea_mode\":\"live\","
    "\"max\":5"
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
      Log(errMsg + " (polling continues; add/approve this MT5 login in the app if needed)");
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

int OnInit()
{
  Log("Init");
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
  PollBackend();
  PushAccountSnapshot();
  PushPositionsSnapshot();
}

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
{
  if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;

  long deal = (long)trans.deal;
  if(deal <= 0) return;

  if(!HistoryDealSelect(deal)) return;

  long entry = (long)HistoryDealGetInteger(deal, DEAL_ENTRY);
  if(entry != DEAL_ENTRY_OUT) return;

  long posTicket = (long)trans.position;
  if(posTicket <= 0) posTicket = (long)HistoryDealGetInteger(deal, DEAL_POSITION_ID);

  string signal_id, mSymbol, mDirection;
  double entry_price, sl, tp, lots;
  if(!GetMappedTrade(posTicket, signal_id, mSymbol, mDirection, entry_price, sl, tp, lots)) return;

  string symbol = HistoryDealGetString(deal, DEAL_SYMBOL);
  long dealType = (long)HistoryDealGetInteger(deal, DEAL_TYPE);
  string direction = (dealType==DEAL_TYPE_BUY ? "BUY" : "SELL");
  double profit = HistoryDealGetDouble(deal, DEAL_PROFIT);
  double price  = HistoryDealGetDouble(deal, DEAL_PRICE);

  ReportTrade(signal_id, posTicket, symbol, direction, "closed", entry_price, sl, tp, lots, profit, price, "");
  Log("Reported close for position=" + IntegerToString((int)posTicket) + " profit=" + DoubleToString(profit,2));
}

void OnTick() {}

