import axios from 'axios'

// Render backend — ML + chart/quote (Twelvedata on Render, yfinance locally)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
})

// Vercel serverless — news via Yahoo Finance RSS (works from all IPs)
const vercel = axios.create({ baseURL: '' })

// ── ML endpoints ─────────────────────────────────────────────────────────────
export const onboard = (answers) =>
  api.post('/onboard', answers)

export const swipe = (userId, ticker, direction) =>
  api.post('/swipe', { user_id: userId, ticker, direction })

export const nextBatch = (userId) =>
  api.get(`/next-batch?user_id=${userId}`)

export const getPlaylist = (userId) =>
  api.get(`/playlist?user_id=${userId}`)

// ── Market data ───────────────────────────────────────────────────────────────
export const getStockHistory = (ticker, period = '1M') =>
  api.get(`/stock/${ticker}/history?period=${period}`)

export const getStockQuote = (ticker) =>
  api.get(`/stock/${ticker}/quote`)

// News via Vercel RSS function — not subject to Yahoo Finance IP blocks
export const getStockNews = (ticker) =>
  vercel.get(`/api/news?ticker=${ticker}`)
