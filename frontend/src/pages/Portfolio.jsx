import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSession } from '../store/useSession'
import StockDetailPanel from '../components/StockDetailPanel'

// ── Sector colors ────────────────────────────────────────────────────────────
const SECTOR_BG = {
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
  'Other':                  'bg-slate-500',
}

function matchBadgeColor(pct) {
  if (pct >= 80) return 'bg-emerald-500/20 text-emerald-400'
  if (pct >= 60) return 'bg-amber-500/20 text-amber-400'
  return 'bg-white/10 text-slate-400'
}

// ── Sector breakdown bar + filter ────────────────────────────────────────────
function SectorBar({ stocks, selectedSectors, onToggleSector, onClearSectors }) {
  const counts = useMemo(() => {
    const map = {}
    for (const s of stocks) {
      const key = s.sector ?? 'Other'
      map[key] = (map[key] ?? 0) + 1
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [stocks])

  if (counts.length === 0) return null
  const total = stocks.length
  const hasFilter = selectedSectors.size > 0

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Sector
        </p>
        {hasFilter && (
          <button
            onClick={onClearSectors}
            className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
          >
            Clear filter
          </button>
        )}
      </div>
      {/* Proportion bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden gap-px mb-2">
        {counts.map(([sector, count]) => (
          <div
            key={sector}
            onClick={() => onToggleSector(sector)}
            className={`${SECTOR_BG[sector] ?? 'bg-slate-500'} cursor-pointer transition-opacity ${
              hasFilter && !selectedSectors.has(sector) ? 'opacity-25' : 'opacity-100'
            }`}
            style={{ width: `${(count / total) * 100}%` }}
            title={sector}
          />
        ))}
      </div>
      {/* Clickable sector pills */}
      <div className="flex flex-wrap gap-1.5">
        {counts.map(([sector, count]) => {
          const active = !hasFilter || selectedSectors.has(sector)
          return (
            <button
              key={sector}
              onClick={() => onToggleSector(sector)}
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                selectedSectors.has(sector)
                  ? 'border-purple-400/60 bg-purple-500/15 text-purple-300'
                  : active
                    ? 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300'
                    : 'border-white/5 bg-transparent text-slate-600 hover:text-slate-400'
              }`}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${SECTOR_BG[sector] ?? 'bg-slate-500'}`} />
              {sector} <span className="text-slate-500">({count})</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Stock card (dark 2-col) ──────────────────────────────────────────────────
function StockCard({ stock, onClick }) {
  const price = stock.price != null
    ? `$${Number(stock.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null

  const dayChg      = stock.day_change_pct
  const dayChgLabel = dayChg != null ? `${dayChg > 0 ? '+' : ''}${dayChg.toFixed(2)}%` : null
  const dayChgColor = dayChg > 0 ? 'text-emerald-400' : dayChg < 0 ? 'text-rose-400' : 'text-slate-500'

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => onClick(stock)}
      className="bg-white/5 rounded-2xl p-3 text-left w-full transition-colors hover:bg-white/10 active:bg-white/15"
    >
      <div className="flex items-start justify-between mb-1">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white leading-none">{stock.ticker}</p>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-snug line-clamp-1">{stock.name}</p>
        </div>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-1 ${matchBadgeColor(stock.match_pct)}`}>
          {stock.match_pct}%
        </span>
      </div>

      {price && (
        <p className="text-xs font-semibold text-white mt-1.5">{price}</p>
      )}
      {dayChgLabel && (
        <p className={`text-[10px] font-medium ${dayChgColor}`}>{dayChgLabel}</p>
      )}

      {stock.sector && (
        <div className="flex items-center gap-1 mt-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${SECTOR_BG[stock.sector] ?? 'bg-slate-500'}`} />
          <span className="text-[9px] text-slate-500 truncate">{stock.sector}</span>
        </div>
      )}
    </motion.button>
  )
}

// ── Bottom sheet ─────────────────────────────────────────────────────────────
function BottomSheet({ stock, onClose }) {
  return (
    <AnimatePresence>
      {stock && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-40"
          />
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-w-sm mx-auto
                       bg-slate-800 rounded-t-3xl shadow-2xl overflow-hidden"
            style={{ maxHeight: '80vh' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-8 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Sheet header */}
            <div className="px-5 py-3 flex items-center justify-between border-b border-white/10">
              <div>
                <h3 className="font-bold text-white text-lg leading-none">{stock.ticker}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{stock.name}</p>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10
                           text-slate-300 hover:bg-white/20 transition-colors text-sm"
              >
                ✕
              </button>
            </div>

            <div style={{ height: 'calc(80vh - 110px)', overflowY: 'auto' }}>
              <StockDetailPanel stock={stock} newsEnabled={true} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}


// ── Main page ────────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { key: 'match',  label: 'Match' },
  { key: 'price',  label: 'Price' },
  { key: 'sector', label: 'Sector' },
]

export default function Portfolio() {
  const navigate  = useNavigate()
  const portfolio = useSession(s => s.portfolio)
  const sortBy    = useSession(s => s.portfolioSortBy)
  const setSortBy = useSession(s => s.setPortfolioSortBy)
  const userId    = useSession(s => s.userId)

  const [selectedStock, setSelectedStock]     = useState(null)
  const [selectedSectors, setSelectedSectors] = useState(new Set())

  if (!userId) {
    navigate('/onboard', { replace: true })
    return null
  }

  function toggleSector(sector) {
    setSelectedSectors(prev => {
      const next = new Set(prev)
      next.has(sector) ? next.delete(sector) : next.add(sector)
      return next
    })
  }

  const sorted = useMemo(() => {
    const arr = [...portfolio]
    if (sortBy === 'match')  arr.sort((a, b) => (b.match_pct ?? 0) - (a.match_pct ?? 0))
    if (sortBy === 'price')  arr.sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
    if (sortBy === 'sector') arr.sort((a, b) => (a.sector ?? 'zzz').localeCompare(b.sector ?? 'zzz'))
    return arr
  }, [portfolio, sortBy])

  const visible = useMemo(
    () => selectedSectors.size === 0
      ? sorted
      : sorted.filter(s => selectedSectors.has(s.sector ?? 'Other')),
    [sorted, selectedSectors]
  )

  return (
    <div className="min-h-screen bg-slate-900 max-w-sm mx-auto pb-24 flex flex-col">

      {/* Header */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Portfolio</h1>
            <p className="text-xs text-slate-400">
              {portfolio.length} stock{portfolio.length !== 1 ? 's' : ''} liked
            </p>
          </div>
          <Link
            to="/swipe"
            className="text-xs font-semibold text-purple-400 bg-purple-500/20
                       px-3 py-1.5 rounded-full hover:bg-purple-500/30 transition-colors"
          >
            + Discover
          </Link>
        </div>

        {/* Sort controls */}
        {portfolio.length > 0 && (
          <div className="flex gap-2">
            {SORT_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                  sortBy === key
                    ? 'bg-purple-500 text-white'
                    : 'bg-white/10 text-slate-400 hover:bg-white/20 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 bg-slate-800 rounded-t-3xl overflow-hidden">
        {portfolio.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-24 gap-3 text-center px-6">
            <span className="text-5xl">📈</span>
            <p className="text-slate-400 text-sm leading-relaxed">
              Swipe right on stocks you like to build your portfolio
            </p>
            <Link
              to="/swipe"
              className="mt-2 text-sm font-semibold text-white bg-purple-600
                         px-5 py-2.5 rounded-2xl hover:bg-purple-700 transition-colors"
            >
              Start swiping
            </Link>
          </div>
        ) : (
          <div className="px-4 pt-4">
            <SectorBar
              stocks={portfolio}
              selectedSectors={selectedSectors}
              onToggleSector={toggleSector}
              onClearSectors={() => setSelectedSectors(new Set())}
            />
            <div className="grid grid-cols-2 gap-3">
              {visible.map((stock, i) => (
                <motion.div
                  key={stock.ticker}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.25 }}
                >
                  <StockCard stock={stock} onClick={setSelectedStock} />
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      <BottomSheet stock={selectedStock} onClose={() => setSelectedStock(null)} />
    </div>
  )
}
