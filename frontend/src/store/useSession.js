import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Global session store — persisted to localStorage so a page refresh
 * doesn't log the user out during a demo.
 */
export const useSession = create(
  persist(
    (set) => ({
      userId: null,
      swipeCount: 0,
      epsilon: 1.0,
      batch: [],           // current queue of scored stock objects

      setUser: (userId) => set({ userId }),

      updateAfterOnboard: ({ userId, firstBatch, epsilon }) =>
        set({ userId, batch: firstBatch, epsilon, swipeCount: 0 }),

      updateAfterSwipe: ({ swipeCount, epsilon }) =>
        set({ swipeCount, epsilon }),

      setBatch: (batch) => set({ batch }),

      appendBatch: (newStocks) =>
        set((state) => ({ batch: [...state.batch, ...newStocks] })),

      shiftBatch: () =>
        set((state) => ({ batch: state.batch.slice(1) })),

      portfolio: [],        // right-swiped stocks (full objects)

      addToPortfolio: (stock) =>
        set((state) => {
          if (state.portfolio.some((s) => s.ticker === stock.ticker)) return state
          return { portfolio: [...state.portfolio, stock] }
        }),

      portfolioSortBy: 'match',  // 'match' | 'price' | 'sector'

      setPortfolioSortBy: (key) => set({ portfolioSortBy: key }),

      reset: () =>
        set({ userId: null, swipeCount: 0, epsilon: 1.0, batch: [], portfolio: [], portfolioSortBy: 'match' }),
    }),
    { name: 'stock-swipe-session' }
  )
)
