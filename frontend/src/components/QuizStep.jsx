import { motion } from 'framer-motion'

const slideVariants = {
  enter:  { x: 60, opacity: 0 },
  center: { x: 0,  opacity: 1, transition: { type: 'spring', stiffness: 260, damping: 28 } },
  exit:   { x: -60, opacity: 0, transition: { duration: 0.18 } },
}

/**
 * A single full-screen quiz step. Wraps content in a Framer Motion slide
 * transition. Children are the answer buttons/controls.
 */
export default function QuizStep({ stepNumber, totalSteps, question, children }) {
  return (
    <motion.div
      key={stepNumber}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      className="flex flex-col items-center justify-center min-h-screen w-full px-6
                 bg-slate-900"
    >
      {/* Progress dots */}
      <div className="flex gap-1.5 mb-10">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300
                        ${i < stepNumber ? 'w-6 bg-purple-500' : i === stepNumber - 1 ? 'w-6 bg-purple-400' : 'w-1.5 bg-white/20'}`}
          />
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-slate-800 rounded-3xl p-8">
        <p className="text-xs font-semibold text-purple-400 tracking-widest uppercase mb-3">
          Question {stepNumber} of {totalSteps}
        </p>
        <h2 className="text-2xl font-bold text-white leading-snug mb-8">
          {question}
        </h2>
        <div className="flex flex-col gap-3">
          {children}
        </div>
      </div>
    </motion.div>
  )
}

/**
 * A big pill-shaped answer button.
 */
export function ChoiceButton({ label, sublabel, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-5 py-3.5 rounded-2xl border-2 transition-all duration-150
                  font-medium text-base
                  ${selected
                    ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                    : 'border-white/10 bg-white/5 text-white hover:border-purple-500/50 hover:bg-purple-500/10'
                  }`}
    >
      {label}
      {sublabel && <span className="block text-xs text-slate-500 font-normal mt-0.5">{sublabel}</span>}
    </button>
  )
}

/**
 * 5-star ESG tap rating.
 */
export function StarRating({ value, onChange }) {
  return (
    <div className="flex justify-center gap-3 py-2">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`text-3xl transition-transform duration-100 hover:scale-110
                      ${n <= value ? 'opacity-100' : 'opacity-25'}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}
