import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSession } from '../store/useSession'
import IndexChart from '../components/IndexChart'
import { getStockQuote } from '../api/client'

// ── helpers ──────────────────────────────────────────────────────────────────
function fmtLarge(v) {
  if (v == null) return '—'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`
  return `$${v}`
}
function fmt(v, d = 2) {
  if (v == null) return '—'
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

const SECTOR_COLORS = {
  'Technology':             'bg-purple-500',
  'Healthcare':             'bg-blue-500',
  'Financials':             'bg-sky-500',
  'Consumer Discretionary': 'bg-pink-500',
  'Consumer Staples':       'bg-lime-500',
  'Energy':                 'bg-emerald-500',
  'Industrials':            'bg-orange-500',
  'Materials':              'bg-yellow-500',
  'Real Estate':            'bg-rose-500',
  'Utilities':              'bg-teal-500',
  'Communication Services': 'bg-violet-500',
}

// ── editable weight cell ──────────────────────────────────────────────────────
function WeightCell({ weight, selected, onCommit }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')
  const inputRef              = useRef(null)

  function open(e) {
    if (!selected) return
    e.stopPropagation()
    setDraft(weight.toFixed(1))
    setEditing(true)
  }

  function commit(e) {
    e?.stopPropagation()
    const val = parseFloat(draft)
    if (!isNaN(val) && val >= 0 && val <= 100) onCommit(val)
    setEditing(false)
  }

  function onKey(e) {
    e.stopPropagation()
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min="0"
        max="100"
        step="0.1"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        className="w-14 text-[11px] font-semibold bg-white/10 text-white rounded px-1.5 py-0.5
                   text-right outline-none border border-purple-400 focus:border-purple-300"
      />
    )
  }

  return (
    <button
      onClick={open}
      onPointerDown={e => { if (selected) e.stopPropagation() }}
      disabled={!selected}
      className={`text-[11px] font-semibold w-10 text-right transition-colors ${
        selected
          ? 'text-purple-400 hover:text-purple-300 cursor-text'
          : 'text-slate-600 cursor-default'
      }`}
    >
      {weight.toFixed(1)}%
    </button>
  )
}

// ── component row ─────────────────────────────────────────────────────────────
function ComponentRow({ stock, selected, onToggle, quote, weight, onWeightCommit }) {
  const price    = quote?.price ?? stock.price
  const dayChg   = quote?.day_change_pct ?? stock.day_change_pct
  const dayColor = dayChg > 0 ? 'text-emerald-400' : dayChg < 0 ? 'text-rose-400' : 'text-slate-400'
  const dayLabel = dayChg != null ? `${dayChg > 0 ? '+' : ''}${dayChg.toFixed(2)}%` : '—'

  return (
    <motion.button
      layout
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
        selected ? 'bg-white/5' : 'opacity-40'
      }`}
    >
      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${
        selected ? 'border-purple-400 bg-purple-400' : 'border-slate-600 bg-transparent'
      }`}>
        {selected && (
          <svg className="w-full h-full" viewBox="0 0 16 16">
            <path d="M13 4L6.5 11 3 7.5" stroke="white" strokeWidth="2" fill="none"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${SECTOR_COLORS[stock.sector] ?? 'bg-slate-500'}`} />
      <div className="flex-1 text-left min-w-0">
        <p className="text-sm font-semibold text-white leading-none">{stock.ticker}</p>
        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{stock.name}</p>
      </div>
      <WeightCell weight={weight} selected={selected} onCommit={onWeightCommit} />
      <div className="text-right w-20">
        <p className="text-xs font-semibold text-white">
          {price != null ? `$${fmt(price)}` : '—'}
        </p>
        <p className={`text-[10px] font-medium ${dayColor}`}>{dayLabel}</p>
      </div>
    </motion.button>
  )
}

// ── metric card ───────────────────────────────────────────────────────────────
function MetricCard({ label, value }) {
  return (
    <div className="bg-white/5 rounded-2xl px-4 py-3 text-center">
      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  )
}

// ── redistribute helper ───────────────────────────────────────────────────────
function redistribute(currentWeights, changedTicker, newVal, allTickers) {
  const clamped = Math.min(100, Math.max(0, newVal))
  const others  = allTickers.filter(t => t !== changedTicker)
  const result  = { ...currentWeights, [changedTicker]: clamped }

  if (others.length === 0) {
    result[changedTicker] = 100
    return result
  }

  const remaining     = 100 - clamped
  const othersTotal   = others.reduce((s, t) => s + (currentWeights[t] ?? 0), 0)

  if (othersTotal === 0) {
    const share = parseFloat((remaining / others.length).toFixed(1))
    others.forEach(t => { result[t] = share })
  } else {
    others.forEach(t => {
      result[t] = parseFloat(((currentWeights[t] / othersTotal) * remaining).toFixed(1))
    })
  }
  return result
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function Index() {
  const navigate  = useNavigate()
  const portfolio = useSession(s => s.portfolio)
  const userId    = useSession(s => s.userId)

  const [selected, setSelected]         = useState(new Set())
  const [draftWeights, setDraftWeights] = useState({})
  const [chartWeights, setChartWeights] = useState({})   // confirmed — drives the chart
  const [weightsDirty, setWeightsDirty] = useState(false)
  const [weightError, setWeightError]   = useState('')
  const [period, setPeriod]             = useState('1M')
  const [quotes, setQuotes]             = useState({})

  if (!userId) { navigate('/onboard', { replace: true }); return null }

  useEffect(() => {
    setSelected(new Set(portfolio.map(s => s.ticker)))
  }, [portfolio.length])

  const selectedTickers = useMemo(
    () => portfolio.filter(s => selected.has(s.ticker)).map(s => s.ticker),
    [portfolio, selected]
  )

  // Reset weights to equal whenever selected set changes
  useEffect(() => {
    const n = selectedTickers.length
    if (!n) {
      setDraftWeights({})
      setChartWeights({})
      setWeightsDirty(false)
      setWeightError('')
      return
    }
    const equal = parseFloat((100 / n).toFixed(1))
    const w = Object.fromEntries(selectedTickers.map(t => [t, equal]))
    setDraftWeights(w)
    setChartWeights(w)
    setWeightsDirty(false)
    setWeightError('')
  }, [selectedTickers.join(',')])

  // Fetch live quotes
  useEffect(() => {
    for (const stock of portfolio) {
      if (quotes[stock.ticker]) continue
      getStockQuote(stock.ticker)
        .then(r => setQuotes(prev => ({ ...prev, [stock.ticker]: r.data })))
        .catch(() => {})
    }
  }, [portfolio.length])

  // Auto-redistribute other weights when one is edited
  function handleWeightCommit(ticker, newVal) {
    const newWeights = redistribute(draftWeights, ticker, newVal, selectedTickers)
    setDraftWeights(newWeights)
    setWeightsDirty(true)
    setWeightError('')
  }

  // Confirm: validate sum and apply to chart
  function handleConfirm() {
    const total = selectedTickers.reduce((s, t) => s + (draftWeights[t] ?? 0), 0)
    if (Math.abs(total - 100) > 1) {
      setWeightError(`Weights add up to ${total.toFixed(1)}% — they must equal 100%`)
      return
    }
    setChartWeights({ ...draftWeights })
    setWeightsDirty(false)
    setWeightError('')
  }

  const totalDraft = selectedTickers.reduce((s, t) => s + (draftWeights[t] ?? 0), 0)
  const isEqualWeight = selectedTickers.length > 0 && selectedTickers.every(t => {
    const equal = parseFloat((100 / selectedTickers.length).toFixed(1))
    return Math.abs((draftWeights[t] ?? equal) - equal) < 0.2
  })

  const metrics = useMemo(() => {
    const stocks = portfolio.filter(s => selected.has(s.ticker))
    if (!stocks.length) return null
    // Only apply non-null quote values so Alpaca nulls don't overwrite Snowflake data
    const live = stocks.map(s => {
      const q = quotes[s.ticker]
      if (!q) return s
      const overrides = Object.fromEntries(Object.entries(q).filter(([, v]) => v != null))
      return { ...s, ...overrides }
    })
    const totalMktCap = live.reduce((a, s) => a + (s.market_cap ?? 0), 0)
    const validPE   = live.filter(s => s.pe_ratio    != null)
    const validBeta = live.filter(s => s.market_beta != null)
    const validChg  = live.filter(s => s.day_change_pct != null)
    return {
      totalMktCap,
      avgPE:   validPE.length   ? validPE.reduce((a, s)   => a + s.pe_ratio, 0)      / validPE.length   : null,
      avgBeta: validBeta.length ? validBeta.reduce((a, s) => a + s.market_beta, 0)   / validBeta.length : null,
      avgChg:  validChg.length  ? validChg.reduce((a, s)  => a + s.day_change_pct, 0) / validChg.length  : null,
    }
  }, [portfolio, selected, quotes])

  function toggleAll() {
    if (selected.size === portfolio.length) setSelected(new Set())
    else setSelected(new Set(portfolio.map(s => s.ticker)))
  }

  const avgChgColor = metrics?.avgChg > 0 ? 'text-emerald-400' : metrics?.avgChg < 0 ? 'text-rose-400' : 'text-slate-300'
  const avgChgLabel = metrics?.avgChg != null
    ? `${metrics.avgChg > 0 ? '+' : ''}${metrics.avgChg.toFixed(2)}%`
    : null

  return (
    <div className="min-h-screen bg-slate-900 max-w-sm mx-auto pb-24 flex flex-col">

      {/* Header */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">My Index</h1>
            <p className="text-xs text-slate-400">
              {selectedTickers.length} of {portfolio.length} component{portfolio.length !== 1 ? 's' : ''}
            </p>
          </div>
          {avgChgLabel && (
            <div className="text-right">
              <p className={`text-lg font-bold ${avgChgColor}`}>{avgChgLabel}</p>
              <p className="text-[10px] text-slate-500">avg today</p>
            </div>
          )}
        </div>

        {portfolio.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center gap-3 text-center">
            <span className="text-4xl">📊</span>
            <p className="text-slate-400 text-sm">Like some stocks first to build your index</p>
          </div>
        ) : (
          <IndexChart
            tickers={selectedTickers}
            period={period}
            onPeriodChange={setPeriod}
            weights={chartWeights}
          />
        )}
      </div>

      {/* Metrics strip */}
      {metrics && (
        <div className="grid grid-cols-3 gap-2 px-4 pb-4">
          <MetricCard label="Mkt Cap"  value={fmtLarge(metrics.totalMktCap)} />
          <MetricCard label="Avg P/E"  value={fmt(metrics.avgPE, 1)} />
          <MetricCard label="Avg Beta" value={fmt(metrics.avgBeta, 2)} />
        </div>
      )}

      {/* Components list */}
      <div className="flex-1 bg-slate-800 rounded-t-3xl overflow-hidden">

        {/* Section header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div>
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Components</p>
            {selectedTickers.length > 0 && (
              <p className="text-[10px] text-slate-500 mt-0.5">
                {isEqualWeight ? 'Equal weight · tap % to edit' : `${totalDraft.toFixed(1)}% allocated · tap % to edit`}
              </p>
            )}
          </div>
          {portfolio.length > 0 && (
            <button
              onClick={toggleAll}
              className="text-[10px] font-medium text-purple-400 hover:text-purple-300 transition-colors"
            >
              {selected.size === portfolio.length ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>

        {/* Confirm bar */}
        <AnimatePresence>
          {weightsDirty && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 py-2 bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {weightError ? (
                    <p className="text-[11px] text-rose-400 font-medium">{weightError}</p>
                  ) : (
                    <p className="text-[11px] text-purple-300">
                      Total: <span className={Math.abs(totalDraft - 100) > 1 ? 'text-rose-400 font-bold' : 'text-white font-bold'}>{totalDraft.toFixed(1)}%</span>
                      {Math.abs(totalDraft - 100) <= 1 && <span className="text-slate-400"> · ready to apply</span>}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleConfirm}
                  className="text-[11px] font-semibold bg-purple-500 hover:bg-purple-400 text-white
                             px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                >
                  Apply Weights
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Column labels */}
        {portfolio.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-1.5 border-b border-white/5">
            <div className="w-4 flex-shrink-0" />
            <div className="w-2 flex-shrink-0" />
            <p className="flex-1 text-[9px] text-slate-500 uppercase tracking-wide">Stock</p>
            <p className="w-10 text-[9px] text-slate-500 uppercase tracking-wide text-right">Wt</p>
            <p className="w-20 text-[9px] text-slate-500 uppercase tracking-wide text-right">Price</p>
          </div>
        )}

        {portfolio.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-6">
            <p className="text-slate-500 text-sm">No liked stocks yet.</p>
            <button
              onClick={() => navigate('/swipe')}
              className="text-xs text-purple-400 hover:text-purple-300 mt-1"
            >
              Start swiping →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {portfolio.map(stock => {
              const isSel = selected.has(stock.ticker)
              const n     = selectedTickers.length || 1
              const w     = draftWeights[stock.ticker] ?? parseFloat((100 / n).toFixed(1))
              return (
                <ComponentRow
                  key={stock.ticker}
                  stock={stock}
                  selected={isSel}
                  onToggle={() => setSelected(prev => {
                    const next = new Set(prev)
                    next.has(stock.ticker) ? next.delete(stock.ticker) : next.add(stock.ticker)
                    return next
                  })}
                  quote={quotes[stock.ticker]}
                  weight={w}
                  onWeightCommit={(val) => handleWeightCommit(stock.ticker, val)}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
