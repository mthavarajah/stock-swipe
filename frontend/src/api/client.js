import axios from 'axios'

// ML endpoints — FastAPI on Render
const ml = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
})

// Market data endpoints — Vercel serverless (same origin, no cold start)
const data = axios.create({
  baseURL: import.meta.env.VITE_DATA_URL || '',
})

// ── ML endpoints (Render) ────────────────────────────────────────────────────
export const onboard = (answers) =>
  ml.post('/onboard', answers)

export const swipe = (userId, ticker, direction) =>
  ml.post('/swipe', { user_id: userId, ticker, direction })

export const nextBatch = (userId) =>
  ml.get(`/next-batch?user_id=${userId}`)

export const getPlaylist = (userId) =>
  ml.get(`/playlist?user_id=${userId}`)

// ── Market data endpoints (Vercel) ───────────────────────────────────────────
export const getStockHistory = (ticker, period = '1M') =>
  data.get(`/api/history?ticker=${ticker}&period=${period}`)

export const getStockQuote = (ticker) =>
  data.get(`/api/quote?ticker=${ticker}`)

export const getStockNews = (ticker) =>
  data.get(`/api/news?ticker=${ticker}`)
