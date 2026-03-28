import { useState, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { getStockHistory } from '../api/client'

const PERIODS = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'All']

export default function StockChart({ ticker }) {
  const [period, setPeriod]     = useState('1M')
  const [chartData, setChartData] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    getStockHistory(ticker, period)
      .then((r) => {
        if (!cancelled) {
          const rows = r.data?.data ?? []
          setChartData(rows.length >= 2 ? rows : null)
        }
      })
      .catch(() => { if (!cancelled) { setChartData(null); setError(true) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticker, period])

  const isPositive = chartData && chartData.length >= 2
    ? (chartData[chartData.length - 1].close ?? 0) >= (chartData[0].close ?? 0)
    : true
  const color = isPositive ? '#10b981' : '#f43f5e'

  return (
    <div className="flex flex-col h-full">
      {/* Chart — fills available height, leaving room for pills */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="w-full h-full bg-white/10 animate-pulse rounded-lg" />
        ) : !chartData ? (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-slate-500 text-xs">{error ? 'Chart unavailable' : 'No data'}</span>
          </div>
        ) : (
          // ResponsiveContainer needs a numeric height when parent uses flex-1
          <ResponsiveContainer width="100%" height="99%">
            <AreaChart data={chartData} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id={`g-${ticker}-${period}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip
                contentStyle={{ fontSize: 10, borderRadius: 8, padding: '3px 8px', border: 'none', background: '#1e293b', color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                formatter={(v) => v != null ? [`$${Number(v).toFixed(2)}`, ''] : ['—', '']}
                labelFormatter={() => ''}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke={color}
                strokeWidth={2}
                fill={`url(#g-${ticker}-${period})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Period pills */}
      <div className="flex gap-1 flex-wrap justify-center pt-1 flex-shrink-0">
        {PERIODS.map((p) => (
          <button
            key={p}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setPeriod(p) }}
            className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium transition-colors ${
              period === p
                ? 'bg-purple-600 text-white'
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
