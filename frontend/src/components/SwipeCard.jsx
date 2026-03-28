import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import {
  motion,
  useMotionValue,
  useTransform,
  useAnimation,
  animate,
} from 'framer-motion'
import StockChart from './StockChart'
import { getStockQuote } from '../api/client'

const SWIPE_THRESHOLD = 120
const ROTATION_RANGE  = 15

const SECTOR_COLORS = {
  'Technology':             'bg-purple-500/20 text-purple-300',
  'Healthcare':             'bg-blue-500/20 text-blue-300',
  'Financials':             'bg-sky-500/20 text-sky-300',
  'Consumer Discretionary': 'bg-pink-500/20 text-pink-300',
  'Consumer Staples':       'bg-lime-500/20 text-lime-300',
  'Energy':                 'bg-emerald-500/20 text-emerald-300',
  'Industrials':            'bg-orange-500/20 text-orange-300',
  'Materials':              'bg-yellow-500/20 text-yellow-300',
  'Real Estate':            'bg-rose-500/20 text-rose-300',
  'Utilities':              'bg-teal-500/20 text-teal-300',
  'Communication Services': 'bg-violet-500/20 text-violet-300',
}

function sectorPill(sector) {
  return SECTOR_COLORS[sector] ?? 'bg-white/10 text-slate-400'
}

function fmt(v, d = 2) {
  if (v == null) return '—'
  return Number(v).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })
}
function fmtLarge(v) {
  if (v == null) return '—'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`
  return `$${fmt(v)}`
}
function fmtRange(lo, hi) {
  if (lo == null || hi == null) return '—'
  return `$${fmt(lo)} – $${fmt(hi)}`
}
function fmtVol(v) {
  if (v == null) return '—'
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`
  return String(v)
}

// Compact 2-column stat cell
function Stat({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-slate-500 uppercase tracking-wide leading-none">{label}</span>
      <span className="text-[11px] font-semibold text-white mt-0.5 leading-tight">{value}</span>
    </div>
  )
}

// Visual range bar with current-price dot
function RangeBar({ label, low, high, current }) {
  const pct = (low != null && high != null && high > low && current != null)
    ? Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100))
    : null
  return (
    <div>
      <span className="text-[9px] text-slate-500 uppercase tracking-wide leading-none">{label}</span>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[9px] text-slate-400 w-11 text-right shrink-0">
          {low != null ? `$${fmt(low)}` : '—'}
        </span>
        <div className="flex-1 h-1.5 bg-white/10 rounded-full relative">
          {pct != null && (
            <>
              <div className="absolute inset-y-0 left-0 rounded-full bg-purple-600/50"
                style={{ width: `${pct}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full
                              bg-purple-400 border-2 border-slate-800 shadow"
                style={{ left: `calc(${pct}% - 5px)` }} />
            </>
          )}
        </div>
        <span className="text-[9px] text-slate-400 w-11 shrink-0">
          {high != null ? `$${fmt(high)}` : '—'}
        </span>
      </div>
    </div>
  )
}

// Flip button
function FlipBtn({ flipped, onClick }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="absolute bottom-3 right-3 z-30 w-8 h-8 rounded-full bg-white/10
                 hover:bg-purple-500/30 text-slate-400 hover:text-purple-300
                 flex items-center justify-center shadow-sm transition-colors"
    >
      {flipped ? (
        // arrow back
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      ) : (
        // info icon
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
        </svg>
      )}
    </button>
  )
}

const SwipeCard = forwardRef(function SwipeCard({ stock, onSwipe, style = {}, isTop }, ref) {
  const dragX    = useMotionValue(0)
  const controls = useAnimation()
  const hasFired = useRef(false)
  const [flipped, setFlipped] = useState(false)

  // Live quote — fetched when this card becomes the top card
  const [quote, setQuote] = useState(null)
  useEffect(() => {
    if (!isTop) return
    let cancelled = false
    getStockQuote(stock.ticker)
      .then((r) => { if (!cancelled) setQuote(r.data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isTop, stock.ticker])

  // Live quote wins for all display fields; fall back to Snowflake snapshot
  const live = {
    price:            quote?.price            ?? stock.price,
    day_change_pct:   quote?.day_change_pct   ?? stock.day_change_pct,
    day_low:          quote?.day_low          ?? stock.day_low,
    day_high:         quote?.day_high         ?? stock.day_high,
    week_52_low:      quote?.week_52_low      ?? stock.week_52_low,
    week_52_high:     quote?.week_52_high     ?? stock.week_52_high,
    volume:           quote?.volume           ?? stock.volume,
    avg_volume:       quote?.avg_volume       ?? stock.avg_volume,
    market_cap:       quote?.market_cap       ?? stock.market_cap,
    pe_ratio:         quote?.pe_ratio         ?? stock.pe_ratio,
    eps:              quote?.eps              ?? stock.eps,
    market_beta:      quote?.market_beta      ?? stock.market_beta,
    dividend_yield:   quote?.dividend_yield   ?? stock.dividend_yield,
    forward_dividend: quote?.forward_dividend ?? stock.forward_dividend,
    earnings_date:    quote?.earnings_date    ?? stock.earnings_date,
    description:      quote?.description      ?? stock.description,
  }

  const rotate      = useTransform(dragX, [-300, 0, 300], [-ROTATION_RANGE, 0, ROTATION_RANGE])
  const likeOpacity = useTransform(dragX, [0, SWIPE_THRESHOLD], [0, 1])
  const passOpacity = useTransform(dragX, [-SWIPE_THRESHOLD, 0], [1, 0])
  const likeStamp   = useTransform(dragX, [20, SWIPE_THRESHOLD], [0, 1])
  const passStamp   = useTransform(dragX, [-SWIPE_THRESHOLD, -20], [1, 0])

  // Exposed to SwipeStack so keyboard events can trigger the full animation
  useImperativeHandle(ref, () => ({
    async triggerSwipe(direction) {
      if (hasFired.current || flipped) return
      hasFired.current = true
      const target = direction === 'right' ? 620 : -620
      // Animate dragX — drives rotation, tint overlays, like/pass stamps.
      // Tween (not spring) so await resolves the moment the card is off-screen,
      // with no spring-settling lag.
      await animate(dragX, target, {
        duration: 0.32,
        ease: [0.4, 0, 0.9, 1],
      })
      onSwipe(direction)
    },
  }))

  async function handleDragEnd(_, info) {
    if (hasFired.current || flipped) return
    const offset = info.offset.x
    if (offset > SWIPE_THRESHOLD) {
      hasFired.current = true
      await controls.start({ x: 600, opacity: 0, transition: { duration: 0.3 } })
      onSwipe('right')
    } else if (offset < -SWIPE_THRESHOLD) {
      hasFired.current = true
      await controls.start({ x: -600, opacity: 0, transition: { duration: 0.3 } })
      onSwipe('left')
    } else {
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } })
    }
  }

  function handleFlip() {
    if (!isTop) return
    dragX.set(0)
    setFlipped((f) => !f)
  }

  const price = live.price != null
    ? `$${Number(live.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null

  const dayChg      = live.day_change_pct
  const dayChgLabel = dayChg != null ? `${dayChg > 0 ? '+' : ''}${dayChg.toFixed(2)}%` : null
  const dayChgColor = dayChg > 0 ? 'text-emerald-400' : dayChg < 0 ? 'text-rose-400' : 'text-slate-500'

  return (
    <motion.div style={{ ...style }} className="absolute inset-0 select-none">
      <motion.div
        drag={isTop && !flipped ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        style={{
          x:           !flipped ? dragX : 0,
          rotate:      !flipped ? rotate : 0,
          width:       '100%',
          height:      '100%',
          perspective: 1200,
        }}
        animate={controls}
        onDragEnd={handleDragEnd}
        className={isTop && !flipped ? 'cursor-grab active:cursor-grabbing' : ''}
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 28 }}
          style={{ transformStyle: 'preserve-3d', width: '100%', height: '100%', position: 'relative' }}
        >

          {/* ══════════════════ FRONT ══════════════════ */}
          <div
            className="absolute inset-0 bg-slate-800 rounded-2xl shadow-xl flex flex-col overflow-hidden"
            style={{ backfaceVisibility: 'hidden' }}
          >
            {/* Tint overlays */}
            <motion.div style={{ opacity: likeOpacity }}
              className="absolute inset-0 bg-emerald-400/15 rounded-2xl pointer-events-none z-10" />
            <motion.div style={{ opacity: passOpacity }}
              className="absolute inset-0 bg-rose-400/15 rounded-2xl pointer-events-none z-10" />
            <motion.div style={{ opacity: likeStamp }}
              className="absolute top-5 right-5 z-20 border-4 border-emerald-400 text-emerald-400
                         font-black text-2xl tracking-widest px-3 py-1 rounded-lg -rotate-[15deg] pointer-events-none">
              LIKE
            </motion.div>
            <motion.div style={{ opacity: passStamp }}
              className="absolute top-5 left-5 z-20 border-4 border-rose-400 text-rose-400
                         font-black text-2xl tracking-widest px-3 py-1 rounded-lg rotate-[15deg] pointer-events-none">
              PASS
            </motion.div>

            {/* Header */}
            <div className="px-4 pt-4 pb-1 flex-shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-2xl font-bold text-white leading-none">{stock.ticker}</h2>
                    <a
                      href={`https://finance.yahoo.com/quote/${stock.ticker}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="text-slate-500 hover:text-purple-400 transition-colors mt-0.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </a>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-snug line-clamp-1">{stock.name}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-baseline gap-1.5 justify-end">
                    {price && <p className="text-lg font-bold text-white">{price}</p>}
                    {dayChgLabel && <p className={`text-xs font-semibold ${dayChgColor}`}>{dayChgLabel}</p>}
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${sectorPill(stock.sector)}`}>
                    {stock.sector ?? 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Chart — half the card */}
            <div className="px-3 flex-shrink-0" style={{ height: '45%' }}>
              <StockChart ticker={stock.ticker} />
            </div>

            {/* Stats grid — 2 cols × 3 rows */}
            <div className="px-4 pt-1 flex-shrink-0">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Stat label="Volume"     value={fmtVol(live.volume)} />
                <Stat label="Avg Volume" value={fmtVol(live.avg_volume)} />
                <Stat label="Market Cap" value={fmtLarge(live.market_cap)} />
                <Stat label="Beta"       value={fmt(live.market_beta)} />
                <Stat label="P/E Ratio"  value={fmt(live.pe_ratio)} />
                <Stat label="EPS"        value={live.eps != null ? `$${fmt(live.eps)}` : '—'} />
              </div>
            </div>

            {/* Range sliders */}
            <div className="px-4 pt-2 pb-1 flex-1 min-h-0 space-y-2">
              <RangeBar label="Day Range"     low={live.day_low}     high={live.day_high}     current={live.price} />
              <RangeBar label="52-Week Range" low={live.week_52_low} high={live.week_52_high} current={live.price} />
            </div>

            <FlipBtn flipped={false} onClick={handleFlip} />
          </div>

          {/* ══════════════════ BACK ══════════════════ */}
          <div
            className="absolute inset-0 bg-slate-800 rounded-2xl shadow-xl flex flex-col overflow-hidden"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            {/* Back header */}
            <div className="px-4 pt-4 pb-2 border-b border-white/10 flex-shrink-0 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white leading-none">{stock.ticker}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{stock.name}</p>
              </div>
              <div className="text-right">
                {price && <p className="text-sm font-bold text-white">{price}</p>}
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${sectorPill(stock.sector)}`}>
                  {stock.sector ?? 'N/A'}
                </span>
              </div>
            </div>

            {/* Description + News */}
            <BackContent stock={{ ...stock, ...live }} />

            <FlipBtn flipped={true} onClick={handleFlip} />
          </div>

        </motion.div>
      </motion.div>
    </motion.div>
  )
})

export default SwipeCard

// ── Back face content (lazy-loads news when flipped) ───────────────────────
import { getStockNews } from '../api/client'

function BackContent({ stock }) {
  const [news, setNews] = useState(null)

  useEffect(() => {
    if (!stock?.ticker) return
    let cancelled = false
    getStockNews(stock.ticker)
      .then((r) => { if (!cancelled) setNews(r.data.articles ?? []) })
      .catch(() => { if (!cancelled) setNews([]) })
    return () => { cancelled = true }
  }, [stock?.ticker])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4" style={{ touchAction: 'pan-y' }}>
      {/* Description */}
      {stock.description ? (
        <p className="text-xs text-slate-300 leading-relaxed">
          {(() => {
            const t = stock.description.trimEnd()
            const last = t.search(/[.!?][^.!?]*$/)
            return last !== -1 ? t.slice(0, last + 1) : t
          })()}
        </p>
      ) : (
        <p className="text-xs text-slate-500 italic">No company description available.</p>
      )}

      {/* News */}
      <div>
        <p className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">Latest News</p>
        {news == null ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-white/10 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : news.length === 0 ? (
          <p className="text-xs text-slate-500">No recent news found.</p>
        ) : (
          <div className="space-y-2">
            {news.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                className="block border border-white/10 rounded-xl p-2.5
                           hover:bg-white/5 active:bg-white/10 transition-colors">
                <p className="text-[11px] font-medium text-white leading-snug line-clamp-2">{a.title}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] text-slate-500">{a.source}</span>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                    a.sentiment > 0.05
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : a.sentiment < -0.05
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-white/10 text-slate-400'
                  }`}>
                    {a.sentiment > 0.05 ? 'Positive' : a.sentiment < -0.05 ? 'Negative' : 'Neutral'}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
