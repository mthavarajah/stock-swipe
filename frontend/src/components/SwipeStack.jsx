import { useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import SwipeCard from './SwipeCard'
import { swipe as apiSwipe, nextBatch as apiNextBatch } from '../api/client'
import { useSession } from '../store/useSession'

const VISIBLE_CARDS  = 3   // how many cards to render in the stack
const REFETCH_BELOW  = 3   // fetch more when queue drops to this size

/**
 * Manages the visual stack of swipe cards.
 * - Renders the top VISIBLE_CARDS items from the session batch.
 * - Calls the swipe API when a card is swiped.
 * - Pre-fetches the next batch when the queue runs low.
 * - Updates the zustand store (swipe_count, epsilon) after each swipe.
 */
export default function SwipeStack() {
  const userId              = useSession(s => s.userId)
  const batch               = useSession(s => s.batch)
  const swipeCount          = useSession(s => s.swipeCount)
  const shiftBatch          = useSession(s => s.shiftBatch)
  const appendBatch         = useSession(s => s.appendBatch)
  const updateAfterSwipe    = useSession(s => s.updateAfterSwipe)
  const addToPortfolio      = useSession(s => s.addToPortfolio)

  const [fetching, setFetching] = useState(false)

  const handleSwipe = useCallback(async (stock, direction) => {
    // Remove card from top of queue immediately (optimistic)
    shiftBatch()

    // Add to portfolio immediately on right swipe (optimistic)
    if (direction === 'right') {
      addToPortfolio(stock)
    }

    // Optimistically update swipe count + epsilon so the bar animates instantly
    const nextCount = swipeCount + 1
    updateAfterSwipe({
      swipeCount: nextCount,
      epsilon: 1 / (1 + 0.1 * nextCount),
    })

    // Confirm with server (overwrites optimistic values with authoritative ones)
    try {
      const { data } = await apiSwipe(userId, stock.ticker, direction)
      updateAfterSwipe({ swipeCount: data.swipe_count, epsilon: data.epsilon })
    } catch (err) {
      console.error('Swipe failed:', err)
    }

    // Pre-fetch next batch when queue is getting thin
    const remaining = batch.length - 1
    if (remaining < REFETCH_BELOW && !fetching) {
      setFetching(true)
      try {
        const { data } = await apiNextBatch(userId)
        appendBatch(data.batch)
      } catch (err) {
        console.error('Next batch fetch failed:', err)
      } finally {
        setFetching(false)
      }
    }
  }, [userId, batch, swipeCount, fetching, shiftBatch, appendBatch, updateAfterSwipe, addToPortfolio])

  // ── Empty state ────────────────────────────────────────────────────────────
  if (batch.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
        {fetching ? (
          <>
            <div className="w-8 h-8 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
            <p className="text-sm">Finding stocks for you…</p>
          </>
        ) : (
          <p className="text-sm">You've seen everything! Come back later.</p>
        )}
      </div>
    )
  }

  // Slice the top VISIBLE_CARDS from the queue
  const visible = batch.slice(0, VISIBLE_CARDS)

  return (
    <div className="relative w-full h-full swipe-container">
      <AnimatePresence>
        {[...visible].reverse().map((stock, reversedIdx) => {
          // reversedIdx 0 = bottom of stack visually, VISIBLE_CARDS-1 = top
          const stackIdx = visible.length - 1 - reversedIdx   // 0 = top card
          const isTop    = stackIdx === 0

          // Scale and vertical offset create the "stacked cards" illusion
          const scale    = 1 - stackIdx * 0.04
          const yOffset  = stackIdx * 10

          return (
            <SwipeCard
              key={stock.ticker + '-' + stackIdx}
              stock={stock}
              isTop={isTop}
              onSwipe={(dir) => handleSwipe(stock, dir)}
              style={{
                scale,
                y: yOffset,
                zIndex: VISIBLE_CARDS - stackIdx,
              }}
            />
          )
        })}
      </AnimatePresence>

      {/* Subtle action hints at the bottom */}
      <div className="absolute -bottom-10 left-0 right-0 flex justify-between px-8 pointer-events-none">
        <span className="text-xs text-slate-400 flex items-center gap-1">
          ← <span className="text-rose-400 font-medium">Pass</span>
        </span>
        <span className="text-xs text-slate-400 flex items-center gap-1">
          <span className="text-emerald-500 font-medium">Like</span> →
        </span>
      </div>
    </div>
  )
}
