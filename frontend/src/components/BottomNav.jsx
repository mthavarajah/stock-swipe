import { NavLink } from 'react-router-dom'
import { useSession } from '../store/useSession'

const TABS = [
  {
    to: '/swipe',
    label: 'Discover',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M19 11H5m14 0l-4-4m4 4l-4 4" />
      </svg>
    ),
  },
  {
    to: '/portfolio',
    label: 'Portfolio',
    icon: (active, count) => (
      <div className="relative">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-[9px] font-bold
                           w-4 h-4 rounded-full flex items-center justify-center leading-none">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </div>
    ),
  },
  {
    to: '/index',
    label: 'Index',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const portfolioCount = useSession(s => s.portfolio.length)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-white/10
                    max-w-sm mx-auto flex">
      {TABS.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-3 text-xs font-medium gap-1 transition-colors ${
              isActive ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'
            }`
          }
        >
          {typeof icon === 'function' ? icon(false, portfolioCount) : icon}
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
