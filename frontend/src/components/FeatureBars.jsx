import { motion } from 'framer-motion'

// Vector dimension order matches backend features.py
const FEATURES = [
  { label: 'Growth',    color: 'bg-purple-500' },
  { label: 'Value',     color: 'bg-blue-500'   },
  { label: 'ESG',       color: 'bg-emerald-500' },
  { label: 'Stability', color: 'bg-teal-500'   },  // inverted volatility
  { label: 'Momentum',  color: 'bg-amber-500'  },
  { label: 'Dividend',  color: 'bg-rose-400'   },
]

/**
 * Six horizontal mini bars — one per stock vector dimension.
 * `vector` is a 6-element array of floats in [0, 1] (L2-normalised, so values
 * can be < 0.5 even for the dominant dimension — we display the raw values).
 */
export default function FeatureBars({ vector = [], small = false }) {
  return (
    <div className={`grid grid-cols-3 ${small ? 'gap-x-3 gap-y-1.5' : 'gap-x-4 gap-y-2'}`}>
      {FEATURES.map(({ label, color }, i) => {
        const value = vector[i] ?? 0
        const pct = Math.round(value * 100)

        return (
          <div key={label}>
            <div className="flex justify-between mb-0.5">
              <span className={`${small ? 'text-[9px]' : 'text-[10px]'} text-slate-400 font-medium`}>
                {label}
              </span>
              <span className={`${small ? 'text-[9px]' : 'text-[10px]'} text-slate-400`}>
                {pct}
              </span>
            </div>

            {/* Track */}
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className={`h-full ${color} rounded-full`}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.04 }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
