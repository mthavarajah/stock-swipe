import { useState, useEffect, useMemo } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { getStockHistory } from '../api/client'

const PERIODS = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y']

// Build a weighted normalized index series from multiple price series.
// Each series is normalized to 100 at its first data point, then combined
// using the provided weights (falls back to equal weight).
function buildIndexSeries(allSeries, weightsArr) {
  if (!allSeries.length) return []

  const bases = allSeries.map(s => s.find(p => p.close != null)?.close ?? 1)

  const dateMap = {}
  for (let i = 0; i < allSeries.length; i++) {
    for (const pt of allSeries[i]) {
      if (pt.close == null) continue
      if (!dateMap[pt.date]) dateMap[pt.date] = []
      dateMap[pt.date][i] = pt.close
    }
  }

  const dates = Object.keys(dateMap).sort()
  if (!dates.length) return []

  return dates.map(date => {
    let sum = 0, totalW = 0
    for (let i = 0; i < allSeries.length; i++) {
      const close = dateMap[date]?.[i]
      if (close != null) {
        const w = weightsArr?.[i] ?? 1
        sum   += (close / bases[i]) * 100 * w
        totalW += w
      }
    }
    return { date, value: totalW ? parseFloat((sum / totalW).toFixed(2)) : null }
  }).filter(p => p.value != null)
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const idx = payload.find(p => p.dataKey === 'value')
  const sp  = payload.find(p => p.dataKey === 'sp500')
  return (
    <div className="bg-slate-900 border border-white/10 text-xs px-3 py-2 rounded-lg shadow-xl space-y-1">
      {idx && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
          <span className="text-slate-400">My Index</span>
          <span className="font-semibold text-white ml-auto pl-3">{idx.value?.toFixed(2)}</span>
        </div>
      )}
      {sp && sp.value != null && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-0.5 bg-slate-400 flex-shrink-0" />
          <span className="text-slate-400">S&P 500</span>
          <span className="font-semibold text-white ml-auto pl-3">{sp.value?.toFixed(2)}</span>
        </div>
      )}
    </div>
  )
}

export default function IndexChart({ tickers, period, onPeriodChange, weights }) {
  const [seriesMap, setSeriesMap] = useState({})
  const [loading, setLoading]     = useState(false)

  // Always include SPY for comparison — fetch alongside portfolio tickers
  const fetchTickers = useMemo(
    () => [...new Set([...tickers, 'SPY'])],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tickers.join(',')]
  )

  useEffect(() => {
    if (!tickers.length) return
    const missing = fetchTickers.filter(t => !seriesMap[`${t}:${period}`])
    if (!missing.length) return

    setLoading(true)
    Promise.all(
      missing.map(t =>
        getStockHistory(t, period)
          .then(r => ({ ticker: t, data: r.data?.data ?? [] }))
          .catch(() => ({ ticker: t, data: [] }))
      )
    ).then(results => {
      setSeriesMap(prev => {
        const next = { ...prev }
        for (const { ticker, data } of results) next[`${ticker}:${period}`] = data
        return next
      })
      setLoading(false)
    })
  }, [fetchTickers.join(','), period])

  const chartData = useMemo(() => {
    const allSeries = tickers.map(t => seriesMap[`${t}:${period}`]).filter(Boolean)
    if (allSeries.length !== tickers.length) return []

    // Weights array parallel to tickers
    const weightsArr = tickers.map(t => weights?.[t] ?? 1)
    const indexData  = buildIndexSeries(allSeries, weightsArr)

    // Normalize SPY to 100 at first point, keyed by date prefix (YYYY-MM-DD)
    const spySeries = seriesMap[`SPY:${period}`] ?? []
    const spyBase   = spySeries.find(p => p.close != null)?.close ?? 1
    const spyMap    = {}
    for (const pt of spySeries) {
      if (pt.close != null) {
        spyMap[pt.date.slice(0, 10)] = parseFloat(((pt.close / spyBase) * 100).toFixed(2))
      }
    }

    // Merge SPY into index data by date prefix
    return indexData.map(pt => ({
      ...pt,
      sp500: spyMap[pt.date.slice(0, 10)] ?? null,
    }))
  }, [seriesMap, tickers.join(','), period, weights])

  const changeInfo = useMemo(() => {
    if (chartData.length < 2) return null
    const start = chartData[0].value
    const end   = chartData[chartData.length - 1].value
    const pct   = ((end - start) / start) * 100
    return { pct: pct.toFixed(2), positive: pct >= 0 }
  }, [chartData])

  const color  = changeInfo?.positive !== false ? '#a855f7' : '#f43f5e'
  const noData = !loading && !chartData.length

  return (
    <div className="flex flex-col gap-2">

      {/* Change badge */}
      {changeInfo && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide">Indexed to 100</span>
          <span className={`text-xs font-bold ${changeInfo.positive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {changeInfo.positive ? '+' : ''}{changeInfo.pct}%
          </span>
        </div>
      )}

      {/* Chart area */}
      <div style={{ height: 190 }}>
        {loading && !chartData.length ? (
          <div className="w-full h-full bg-white/5 animate-pulse rounded-xl" />
        ) : noData ? (
          <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
            {tickers.length === 0 ? 'Select stocks to build your index' : 'No chart data'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="indexGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis domain={['auto', 'auto']} hide />
              <ReferenceLine y={100} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
              <Tooltip content={<CustomTooltip />} />
              {/* Portfolio index — filled area */}
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2.5}
                fill="url(#indexGrad)"
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
              {/* S&P 500 — dashed grey line */}
              <Line
                type="monotone"
                dataKey="sp500"
                stroke="#64748b"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      {!noData && (
        <div className="flex items-center justify-center gap-5">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full bg-purple-500 inline-block" />
            <span className="text-[10px] text-slate-400">My Index</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="14" height="4" className="inline-block">
              <line x1="0" y1="2" x2="14" y2="2" stroke="#64748b" strokeWidth="1.5" strokeDasharray="5 3" />
            </svg>
            <span className="text-[10px] text-slate-400">S&P 500</span>
          </div>
        </div>
      )}

      {/* Period pills */}
      <div className="flex gap-1.5 justify-center">
        {PERIODS.map(p => (
          <button
            key={p}
            onClick={() => onPeriodChange(p)}
            className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${
              period === p
                ? 'bg-purple-500 text-white'
                : 'bg-white/10 text-slate-400 hover:bg-white/20 hover:text-white'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}
