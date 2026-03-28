import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import QuizStep, { ChoiceButton, StarRating } from '../components/QuizStep'
import { onboard as apiOnboard } from '../api/client'
import { useSession } from '../store/useSession'

const LOADING_MESSAGES = [
  'Collecting data based on your preferences…',
  'Training your personalised model…',
  'Scanning 500+ stocks for matches…',
  'Ranking stocks just for you…',
  'Curating your first batch…',
  'Almost there…',
]

const FLOATING_TICKERS = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'BRK', 'JPM', 'V']

function LoadingScreen() {
  const [msgIdx, setMsgIdx] = useState(0)
  const [progress, setProgress] = useState(0)

  // Cycle messages every 1.8 s
  useEffect(() => {
    const id = setInterval(() => {
      setMsgIdx(i => Math.min(i + 1, LOADING_MESSAGES.length - 1))
    }, 1800)
    return () => clearInterval(id)
  }, [])

  // Fake progress bar — ramps to ~90 % then stalls waiting for server
  useEffect(() => {
    let v = 0
    const id = setInterval(() => {
      v = v < 88 ? v + (88 - v) * 0.06 : v
      setProgress(v)
    }, 100)
    return () => clearInterval(id)
  }, [])

  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 overflow-hidden"
    >
      {/* Floating ticker pills */}
      {FLOATING_TICKERS.map((t, i) => (
        <motion.span
          key={t}
          initial={{ opacity: 0, y: 60 }}
          animate={{
            opacity: [0, 0.18, 0.18, 0],
            y: [60, -20],
          }}
          transition={{
            delay: i * 0.55,
            duration: 3.5,
            repeat: Infinity,
            repeatDelay: FLOATING_TICKERS.length * 0.55 - 3.5,
          }}
          style={{ left: `${8 + (i % 5) * 18}%` }}
          className="absolute bottom-24 text-[11px] font-bold text-purple-400/40 tracking-widest pointer-events-none select-none"
        >
          {t}
        </motion.span>
      ))}

      {/* Pulsing logo mark */}
      <motion.div
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="mb-8"
      >
        <div className="w-16 h-16 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shadow-lg shadow-purple-900/40">
          <svg className="w-8 h-8 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
        </div>
      </motion.div>

      {/* Cycling message */}
      <div className="h-8 flex items-center justify-center mb-8">
        <AnimatePresence mode="wait">
          <motion.p
            key={msgIdx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="text-sm font-medium text-slate-300 text-center px-8"
          >
            {LOADING_MESSAGES[msgIdx]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <div className="w-56 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-violet-400"
          style={{ width: `${progress}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Dot trail */}
      <div className="flex gap-1.5 mt-5">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.3 }}
            className="w-1.5 h-1.5 rounded-full bg-purple-400"
          />
        ))}
      </div>
    </motion.div>
  )
}

const TOTAL_STEPS = 5

const INITIAL_ANSWERS = {
  style: null,         // 'growth' | 'value' | 'balanced'
  esg_priority: 3,     // 1-5
  risk_tolerance: null,// 'low' | 'medium' | 'high'
  time_horizon: null,  // 'short' | 'long'
  wants_dividend: null,// true | false
}

export default function Onboard() {
  const navigate = useNavigate()
  const updateAfterOnboard = useSession(s => s.updateAfterOnboard)

  const [step, setStep] = useState(1)
  const [answers, setAnswers] = useState(INITIAL_ANSWERS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function set(key, value) {
    setAnswers(prev => ({ ...prev, [key]: value }))
  }

  async function advance(key, value) {
    const updated = { ...answers, [key]: value }
    setAnswers(updated)

    if (step < TOTAL_STEPS) {
      setStep(s => s + 1)
      return
    }

    // Final step — call the API
    setLoading(true)
    setError(null)
    try {
      const { data } = await apiOnboard(updated)
      updateAfterOnboard({
        userId:     data.user_id,
        firstBatch: data.first_batch,
        epsilon:    data.epsilon,
      })
      navigate('/swipe')
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <>
      {/* Full-screen loading overlay */}
      <AnimatePresence>
        {loading && <LoadingScreen />}
      </AnimatePresence>

      {/* Logo strip */}
      <div className="fixed top-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
        <h1 className="text-lg font-bold text-white tracking-tight">
          Stock<span className="text-purple-400">Swipe</span>
        </h1>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <QuizStep key={1} stepNumber={1} totalSteps={TOTAL_STEPS}
            question="What's your investing style?">
            <ChoiceButton label="Growth" sublabel="High potential, higher risk"
              selected={answers.style === 'growth'}
              onClick={() => advance('style', 'growth')} />
            <ChoiceButton label="Value" sublabel="Undervalued, steady performers"
              selected={answers.style === 'value'}
              onClick={() => advance('style', 'value')} />
            <ChoiceButton label="Balanced" sublabel="A bit of everything"
              selected={answers.style === 'balanced'}
              onClick={() => advance('style', 'balanced')} />
          </QuizStep>
        )}

        {step === 2 && (
          <QuizStep key={2} stepNumber={2} totalSteps={TOTAL_STEPS}
            question="How important is ESG to you?">
            <p className="text-sm text-slate-500 text-center -mt-4 mb-2">
              Environmental, Social &amp; Governance
            </p>
            <StarRating
              value={answers.esg_priority}
              onChange={v => set('esg_priority', v)}
            />
            <button
              onClick={() => advance('esg_priority', answers.esg_priority)}
              className="mt-4 w-full py-3.5 rounded-2xl bg-purple-600 text-white
                         font-semibold text-sm hover:bg-purple-700 transition-colors"
            >
              Continue →
            </button>
          </QuizStep>
        )}

        {step === 3 && (
          <QuizStep key={3} stepNumber={3} totalSteps={TOTAL_STEPS}
            question="What's your risk tolerance?">
            <ChoiceButton label="Low" sublabel="I prefer stability over returns"
              selected={answers.risk_tolerance === 'low'}
              onClick={() => advance('risk_tolerance', 'low')} />
            <ChoiceButton label="Medium" sublabel="Balanced approach"
              selected={answers.risk_tolerance === 'medium'}
              onClick={() => advance('risk_tolerance', 'medium')} />
            <ChoiceButton label="High" sublabel="I can stomach big swings"
              selected={answers.risk_tolerance === 'high'}
              onClick={() => advance('risk_tolerance', 'high')} />
          </QuizStep>
        )}

        {step === 4 && (
          <QuizStep key={4} stepNumber={4} totalSteps={TOTAL_STEPS}
            question="What's your time horizon?">
            <ChoiceButton label="Short term" sublabel="Under 2 years"
              selected={answers.time_horizon === 'short'}
              onClick={() => advance('time_horizon', 'short')} />
            <ChoiceButton label="Long term" sublabel="5 years or more"
              selected={answers.time_horizon === 'long'}
              onClick={() => advance('time_horizon', 'long')} />
          </QuizStep>
        )}

        {step === 5 && (
          <QuizStep key={5} stepNumber={5} totalSteps={TOTAL_STEPS}
            question="Do you want dividend income?">
            <ChoiceButton label="Yes" sublabel="I like regular cash payouts"
              selected={answers.wants_dividend === true}
              onClick={() => advance('wants_dividend', true)} />
            <ChoiceButton label="No" sublabel="I prefer growth over income"
              selected={answers.wants_dividend === false}
              onClick={() => advance('wants_dividend', false)} />

            {error && (
              <p className="text-xs text-rose-500 text-center mt-2">{error}</p>
            )}
          </QuizStep>
        )}
      </AnimatePresence>
    </>
  )
}
