import { useEffect, useState } from 'react'
import RangeBar from './RangeBar'
import { getStockNews } from '../api/client'

function StatRow({ label, value }) {
  if (value == null) return null
  return (
    <div className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs font-semibold text-white">{value}</span>
    </div>
  )
}

function fmt(v, decimals = 2) {
  if (v == null) return null
  return Number(v).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtLarge(v) {
  if (v == null) return null
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`
  return `$${fmt(v)}`
}

function fmtDividend(v) {
  if (v == null) return null
  const display = v > 1 ? v : v * 100
  return `${display.toFixed(2)}%`
}

export default function StockDetailPanel({ stock, newsEnabled = true }) {
  const [news, setNews] = useState(null)

  useEffect(() => {
    if (!stock?.ticker || !newsEnabled) return
    let cancelled = false
    getStockNews(stock.ticker)
      .then((r) => { if (!cancelled) setNews(r.data.articles ?? []) })
      .catch(() => { if (!cancelled) setNews([]) })
    return () => { cancelled = true }
  }, [stock?.ticker, newsEnabled])

  if (!stock) return null

  const dayChg    = stock.day_change_pct
  const dayChgStr = dayChg != null
    ? `${dayChg > 0 ? '+' : ''}${fmt(dayChg)}%`
    : null
  const dayChgColor =
    dayChg > 0 ? 'text-emerald-400' : dayChg < 0 ? 'text-rose-400' : 'text-slate-400'

  return (
    <div
      className="h-full overflow-y-auto px-4 py-3 space-y-4"
      style={{ touchAction: 'pan-y' }}
      onClick={(e) => e.stopPropagation()}
    >

      {/* Description */}
      {stock.description && (
        <p className="text-xs text-slate-300 leading-relaxed">
          {stock.description}
        </p>
      )}

      {/* Range bars */}
      {(stock.day_low != null || stock.week_52_low != null) && (
        <div className="space-y-3">
          <RangeBar
            label="Day Range"
            low={stock.day_low}
            high={stock.day_high}
            current={stock.price}
          />
          <RangeBar
            label="52-Week Range"
            low={stock.week_52_low}
            high={stock.week_52_high}
            current={stock.price}
          />
        </div>
      )}

      {/* Stats */}
      <div>
        <StatRow label="Market Cap"     value={fmtLarge(stock.market_cap)} />
        <StatRow label="P/E Ratio"      value={fmt(stock.pe_ratio)} />
        <StatRow label="EPS"            value={stock.eps != null ? `$${fmt(stock.eps)}` : null} />
        <StatRow label="Beta"           value={fmt(stock.market_beta)} />
        <StatRow label="Div Yield"      value={fmtDividend(stock.dividend_yield)} />
        <StatRow label="Fwd Dividend"   value={stock.forward_dividend != null ? `$${fmt(stock.forward_dividend)}` : null} />
        <StatRow label="Earnings"       value={stock.earnings_date} />
        <StatRow label="Short Ratio"    value={fmt(stock.short_ratio)} />
        {dayChgStr && (
          <div className="flex justify-between items-center py-2">
            <span className="text-xs text-slate-400">Today</span>
            <span className={`text-xs font-semibold ${dayChgColor}`}>{dayChgStr}</span>
          </div>
        )}
      </div>

      {/* News */}
      {newsEnabled && (
        <div>
          <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2">Latest News</p>
          {news == null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 bg-white/10 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : news.length === 0 ? (
            <p className="text-xs text-slate-500">No recent news available.</p>
          ) : (
            <div className="space-y-2">
              {news.map((article, i) => (
                <a
                  key={i}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block border border-white/10 rounded-xl p-2.5 hover:bg-white/5 transition-colors"
                >
                  <p className="text-xs font-medium text-white leading-snug line-clamp-2">
                    {article.title}
                  </p>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-slate-500">{article.source}</span>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                      article.sentiment > 0.05
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : article.sentiment < -0.05
                          ? 'bg-rose-500/20 text-rose-400'
                          : 'bg-white/10 text-slate-400'
                    }`}>
                      {article.sentiment > 0.05 ? 'Positive' : article.sentiment < -0.05 ? 'Negative' : 'Neutral'}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
