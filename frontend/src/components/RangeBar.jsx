/**
 * Horizontal range bar with a colored dot showing current value position.
 * dot: emerald (top third), amber (middle third), rose (bottom third)
 */
export default function RangeBar({ label, low, high, current }) {
  if (low == null || high == null || current == null) return null

  const range = high - low || 1
  const pct   = Math.min(Math.max((current - low) / range, 0), 1)
  const dotColor =
    pct > 0.66 ? 'bg-emerald-500' : pct > 0.33 ? 'bg-amber-400' : 'bg-rose-500'

  const fmt = (v) =>
    `$${Number(v).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
        {label}
      </span>
      <div className="relative h-1.5 bg-white/10 rounded-full mx-1">
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-slate-800 shadow-sm ${dotColor}`}
          style={{ left: `calc(${pct * 100}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-500 px-1">
        <span>{fmt(low)}</span>
        <span className="text-white font-semibold">{fmt(current)}</span>
        <span>{fmt(high)}</span>
      </div>
    </div>
  )
}
