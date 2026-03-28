import axios from 'axios'

// All endpoints — FastAPI on Render (ML + market data)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
})

// ── ML endpoints ─────────────────────────────────────────────────────────────
export const onboard = (answers) =>
  api.post('/onboard', answers)

export const swipe = (userId, ticker, direction) =>
  api.post('/swipe', { user_id: userId, ticker, direction })

export const nextBatch = (userId) =>
  api.get(`/next-batch?user_id=${userId}`)

export const getPlaylist = (userId) =>
  api.get(`/playlist?user_id=${userId}`)

// ── Market data endpoints ─────────────────────────────────────────────────────
export const getStockHistory = (ticker, period = '1M') =>
  api.get(`/stock/${ticker}/history?period=${period}`)

export const getStockQuote = (ticker) =>
  api.get(`/stock/${ticker}/quote`)

export const getStockNews = (ticker) =>
  api.get(`/stock/${ticker}/news`)
