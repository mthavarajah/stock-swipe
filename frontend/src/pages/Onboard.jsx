import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import QuizStep, { ChoiceButton, StarRating } from '../components/QuizStep'
import { onboard as apiOnboard } from '../api/client'
import { useSession } from '../store/useSession'

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
            {loading && (
              <div className="flex justify-center mt-2">
                <div className="w-5 h-5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
              </div>
            )}
          </QuizStep>
        )}
      </AnimatePresence>
    </>
  )
}
