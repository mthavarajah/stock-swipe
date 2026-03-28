import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import FeatureBars from '../components/FeatureBars'
import { getPlaylist } from '../api/client'
import { useSession } from '../store/useSession'

function matchBadgeColor(pct) {
  if (pct >= 80) return 'bg-emerald-100 text-emerald-700'
  if (pct >= 60) return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-500'
}

export default function Playlist() {
  const navigate = useNavigate()
  const userId   = useSession(s => s.userId)

  const [stocks, setStocks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!userId) { navigate('/onboard', { replace: true }); return }

    getPlaylist(userId)
      .then(({ data }) => setStocks(data.stocks))
      .catch(() => setError('Failed to load playlist'))
      .finally(() => setLoading(false))
  }, [userId, navigate])

  return (
    <div className="min-h-screen bg-slate-50 max-w-sm mx-auto">

      {/* Header */}
      <div className="sticky top-0 bg-slate-50/90 backdrop-blur-sm z-10
                      flex items-center justify-between px-4 py-4 border-b border-slate-100">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            Your Playlist
            {stocks.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-400">
                {stocks.length} stock{stocks.length !== 1 ? 's' : ''}
              </span>
            )}
          </h1>
        </div>
        <Link
          to="/swipe"
          className="text-xs font-semibold text-purple-600 bg-purple-50
                     px-3 py-1.5 rounded-full hover:bg-purple-100 transition-colors"
        >
          ← Swipe
        </Link>
      </div>

      {/* Body */}
      <div className="px-4 py-4">

        {loading && (
          <div className="flex justify-center pt-20">
            <div className="w-8 h-8 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <p className="text-center text-rose-500 text-sm pt-20">{error}</p>
        )}

        {!loading && !error && stocks.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-28 gap-3 text-center px-6">
            <span className="text-4xl">📋</span>
            <p className="text-slate-500 text-sm leading-relaxed">
              Swipe right on stocks you like to build your playlist
            </p>
            <Link
              to="/swipe"
              className="mt-2 text-sm font-semibold text-white bg-purple-600
                         px-5 py-2.5 rounded-2xl hover:bg-purple-700 transition-colors"
            >
              Start swiping
            </Link>
          </div>
        )}

        {!loading && stocks.length > 0 && (
          <div className="flex flex-col gap-3">
            {stocks.map((stock, i) => (
              <motion.div
                key={stock.ticker}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className="bg-white rounded-2xl shadow-sm p-4"
              >
                {/* Top row */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xl font-bold text-slate-900">{stock.ticker}</p>
                    <p className="text-xs text-slate-400 leading-snug">{stock.name}</p>
                  </div>
                  <div className={`text-sm font-bold px-3 py-1 rounded-full ${matchBadgeColor(stock.match_pct)}`}>
                    {stock.match_pct}% match
                  </div>
                </div>

                {/* Sector + price */}
                <div className="flex items-center gap-2 mb-3">
                  {stock.sector && (
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      {stock.sector}
                    </span>
                  )}
                  {stock.price != null && (
                    <span className="text-xs font-medium text-slate-600">
                      ${Number(stock.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                </div>

                {/* Feature bars (smaller version) */}
                <FeatureBars vector={stock.vector} small />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
