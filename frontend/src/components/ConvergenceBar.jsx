import { motion } from 'framer-motion'

const MILESTONES = [
  { max: 20,  copy: 'Swipe to train your AI' },
  { max: 50,  copy: 'AI is learning your style' },
  { max: 80,  copy: 'Picks getting more accurate' },
  { max: 100, copy: 'AI tuned to your taste' },
]

function getMilestoneCopy(pct) {
  return MILESTONES.find(m => pct <= m.max)?.copy ?? 'AI tuned to your taste'
}

/**
 * Visualises how much the ML model has learned about the user.
 * profile_pct = (1 - epsilon) * 100, so it starts at 0 and grows toward 100.
 */
export default function ConvergenceBar({ epsilon }) {
  const pct = Math.round((1 - epsilon) * 100)
  const copy = getMilestoneCopy(pct)

  return (
    <div className="px-4 pt-3 pb-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-slate-400">{copy}</span>
        <span className="text-xs font-semibold text-purple-400">{pct}% personalised</span>
      </div>

      {/* Track */}
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-400 rounded-full"
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 60, damping: 18 }}
        />
      </div>
    </div>
  )
}
