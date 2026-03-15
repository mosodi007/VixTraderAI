import { useState } from 'react';
import { TrendingUp, Sparkles, RefreshCw, Loader2 } from 'lucide-react';

interface Asset {
  symbol: string;
  name: string;
  category: string;
  description: string;
}

const TRADING_ASSETS: Asset[] = [
  {
    symbol: 'R_10',
    name: 'Volatility 10 Index',
    category: 'Volatility Indices',
    description: 'Simulates market volatility with an average of 10% movement per tick'
  },
  {
    symbol: 'R_50',
    name: 'Volatility 50 Index',
    category: 'Volatility Indices',
    description: 'Simulates market volatility with an average of 50% movement per tick'
  },
  {
    symbol: 'R_100',
    name: 'Volatility 100 Index',
    category: 'Volatility Indices',
    description: 'Simulates market volatility with an average of 100% movement per tick'
  },
  {
    symbol: '1HZ10V',
    name: 'Volatility 10 (1s) Index',
    category: 'Volatility Indices',
    description: 'High-frequency volatility index with 1-second ticks'
  },
  {
    symbol: '1HZ30V',
    name: 'Volatility 30 (1s) Index',
    category: 'Volatility Indices',
    description: 'High-frequency volatility index with 1-second ticks'
  },
  {
    symbol: '1HZ50V',
    name: 'Volatility 50 (1s) Index',
    category: 'Volatility Indices',
    description: 'High-frequency volatility index with 1-second ticks'
  },
  {
    symbol: '1HZ90V',
    name: 'Volatility 90 (1s) Index',
    category: 'Volatility Indices',
    description: 'High-frequency volatility index with 1-second ticks'
  },
  {
    symbol: '1HZ100V',
    name: 'Volatility 100 (1s) Index',
    category: 'Volatility Indices',
    description: 'High-frequency volatility index with 1-second ticks'
  },
  {
    symbol: 'STPIDX',
    name: 'Step Index',
    category: 'Step Indices',
    description: 'Moves in fixed price increments at regular intervals'
  },
  {
    symbol: '1HZ200V',
    name: 'Volatility 200 (1s) Index',
    category: 'Volatility Indices',
    description: 'Ultra high-frequency volatility index with 1-second ticks'
  },
  {
    symbol: '1HZ300V',
    name: 'Volatility 300 (1s) Index',
    category: 'Volatility Indices',
    description: 'Ultra high-frequency volatility index with 1-second ticks'
  },
  {
    symbol: 'stpRNG',
    name: 'Step Index',
    category: 'Step Indices',
    description: 'Moves in fixed price increments at regular intervals'
  },
  {
    symbol: 'JD25',
    name: 'Jump 25 Index',
    category: 'Jump Indices',
    description: 'Jump index with 25% average movement per tick'
  }
];

interface TradingAssetsProps {
  onGenerateSignal: (symbol: string) => void;
  generatingFor: string | null;
}

export function TradingAssets({ onGenerateSignal, generatingFor }: TradingAssetsProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = ['all', ...Array.from(new Set(TRADING_ASSETS.map(a => a.category)))];

  const filteredAssets = selectedCategory === 'all'
    ? TRADING_ASSETS
    : TRADING_ASSETS.filter(a => a.category === selectedCategory);

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-600/20 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Trading Assets</h3>
            <p className="text-sm text-slate-400">{filteredAssets.length} Available Instruments</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {categories.map(category => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              selectedCategory === category
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {category === 'all' ? 'All Assets' : category}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAssets.map((asset) => (
          <div
            key={asset.symbol}
            className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 hover:border-emerald-600/50 transition-all group"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-white font-bold mb-1">{asset.name}</h4>
                <p className="text-xs text-slate-500 font-mono">{asset.symbol}</p>
              </div>
            </div>

            <p className="text-sm text-slate-400 mb-4 line-clamp-2">
              {asset.description}
            </p>

            <button
              onClick={() => onGenerateSignal(asset.symbol)}
              disabled={generatingFor !== null}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                generatingFor === asset.symbol
                  ? 'bg-emerald-600 text-white'
                  : generatingFor !== null
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-600/30'
              }`}
            >
              {generatingFor === asset.symbol ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Signal
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
