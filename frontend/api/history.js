import yahooFinance from 'yahoo-finance2'

const CONFIGS = {
  '1D':  { interval: '5m',   daysBack: 1 },
  '5D':  { interval: '15m',  daysBack: 5 },
  '1M':  { interval: '1d',   daysBack: 30 },
  '6M':  { interval: '1d',   daysBack: 180 },
  'YTD': { interval: '1d',   ytd: true },
  '1Y':  { interval: '1wk',  daysBack: 365 },
  '5Y':  { interval: '1mo',  daysBack: 365 * 5 },
  'All': { interval: '3mo',  daysBack: 365 * 20 },
}

export default async function handler(req, res) {
  const { ticker, period = '1M' } = req.query
  if (!ticker) return res.status(400).json({ error: 'ticker required' })

  const sym    = ticker.toUpperCase()
  const config = CONFIGS[period] ?? CONFIGS['1M']
  const now    = new Date()

  let period1
  if (config.ytd) {
    period1 = new Date(now.getFullYear(), 0, 1)
  } else {
    period1 = new Date(now.getTime() - config.daysBack * 24 * 60 * 60 * 1000)
  }

  try {
    const result = await yahooFinance.chart(sym, {
      period1,
      interval: config.interval,
      validateResult: false,
    })

    const quotes = result.quotes ?? []
    const rows = quotes
      .filter(q => q.close != null)
      .map(q => ({
        date:   q.date instanceof Date ? q.date.toISOString() : String(q.date),
        close:  parseFloat(q.close.toFixed(4)),
        open:   q.open   != null ? parseFloat(q.open.toFixed(4))   : null,
        high:   q.high   != null ? parseFloat(q.high.toFixed(4))   : null,
        low:    q.low    != null ? parseFloat(q.low.toFixed(4))    : null,
        volume: q.volume ?? null,
      }))

    if (rows.length < 2) return res.status(404).json({ error: 'No data' })

    const first = rows[0].close
    const last  = rows[rows.length - 1].close
    const changePct = parseFloat(((last - first) / first * 100).toFixed(2))

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')
    res.json({
      ticker: sym,
      period,
      change_pct: changePct,
      change_abs: parseFloat((last - first).toFixed(2)),
      data: rows,
    })
  } catch (err) {
    console.error('history error', sym, err.message)
    res.status(404).json({ error: 'No data available' })
  }
}
