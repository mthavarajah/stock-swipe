import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ConvergenceBar from '../components/ConvergenceBar'
import SwipeStack from '../components/SwipeStack'
import { useSession } from '../store/useSession'

export default function Swipe() {
  const navigate  = useNavigate()
  const userId    = useSession(s => s.userId)
  const epsilon   = useSession(s => s.epsilon)
  const swipeCount = useSession(s => s.swipeCount)

  // Guard: if no session, send back to onboarding
  useEffect(() => {
    if (!userId) navigate('/onboard', { replace: true })
  }, [userId, navigate])

  if (!userId) return null

  return (
    <div className="flex flex-col h-screen bg-slate-900 max-w-sm mx-auto">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <h1 className="text-base font-bold text-white tracking-tight">
          Stock<span className="text-purple-400">Swipe</span>
        </h1>
      </div>

      {/* Convergence bar — updates live after every swipe via zustand */}
      <ConvergenceBar epsilon={epsilon} />

      {/* Swipe count pill */}
      <div className="flex justify-center pb-2">
        <span className="text-xs text-slate-500">
          {swipeCount === 0
            ? 'Start swiping to train your model'
            : `${swipeCount} swipe${swipeCount !== 1 ? 's' : ''} so far`}
        </span>
      </div>

      {/* Card stack — takes remaining vertical space; pb-20 clears BottomNav */}
      <div className="flex-1 relative px-4 pb-20">
        <SwipeStack />
      </div>
    </div>
  )
}
