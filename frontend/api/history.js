import yf from 'yahoo-finance2'
const yahooFinance = yf.default ?? yf

// For intraday (1D/5D) we must use chart(); for everything else historical() is more reliable
const CONFIGS = {
  '1D':  { useChart: true,  interval: '5m',   daysBack: 1 },
  '5D':  { useChart: true,  interval: '60m',  daysBack: 5 },
  '1M':  { useChart: false, interval: '1d',   daysBack: 30 },
  '6M':  { useChart: false, interval: '1d',   daysBack: 180 },
  'YTD': { useChart: false, interval: '1d',   ytd: true },
  '1Y':  { useChart: false, interval: '1wk',  daysBack: 365 },
  '5Y':  { useChart: false, interval: '1mo',  daysBack: 365 * 5 },
  'All': { useChart: false, interval: '1mo',  daysBack: 365 * 20 },
}

function getPeriod1(config) {
  if (config.ytd) return new Date(new Date().getFullYear(), 0, 1)
  return new Date(Date.now() - config.daysBack * 24 * 60 * 60 * 1000)
}

export default async function handler(req, res) {
  const { ticker, period = '1M' } = req.query
  if (!ticker) return res.status(400).json({ error: 'ticker required' })

  const sym    = ticker.toUpperCase()
  const config = CONFIGS[period] ?? CONFIGS['1M']
  const period1 = getPeriod1(config)

  try {
    let rows = []

    if (config.useChart) {
      // Intraday — use chart()
      const result = await yahooFinance.chart(sym, {
        period1,
        interval: config.interval,
      }, { validateResult: false })

      rows = (result?.quotes ?? [])
        .filter(q => q.close != null)
        .map(q => ({
          date:   q.date instanceof Date ? q.date.toISOString() : String(q.date),
          close:  parseFloat(Number(q.close).toFixed(4)),
          open:   q.open   != null ? parseFloat(Number(q.open).toFixed(4))   : null,
          high:   q.high   != null ? parseFloat(Number(q.high).toFixed(4))   : null,
          low:    q.low    != null ? parseFloat(Number(q.low).toFixed(4))    : null,
          volume: q.volume ?? null,
        }))
    } else {
      // Daily/weekly/monthly — use historical() which is more reliable
      const result = await yahooFinance.historical(sym, {
        period1,
        interval: config.interval,
      }, { validateResult: false })

      rows = (Array.isArray(result) ? result : [])
        .filter(q => q.close != null || q.adjClose != null)
        .map(q => ({
          date:   q.date instanceof Date ? q.date.toISOString() : String(q.date),
          close:  parseFloat(Number(q.adjClose ?? q.close).toFixed(4)),
          open:   q.open   != null ? parseFloat(Number(q.open).toFixed(4))   : null,
          high:   q.high   != null ? parseFloat(Number(q.high).toFixed(4))   : null,
          low:    q.low    != null ? parseFloat(Number(q.low).toFixed(4))    : null,
          volume: q.volume ?? null,
        }))
    }

    if (rows.length < 2) {
      // Return empty data rather than 404 — lets frontend show "No data" not an error
      return res.json({ ticker: sym, period, change_pct: 0, change_abs: 0, data: [] })
    }

    const first     = rows[0].close
    const last      = rows[rows.length - 1].close
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
    console.error('history error', sym, period, err.message)
    // Return empty rather than error so frontend shows "No data" gracefully
    res.json({ ticker: sym, period, change_pct: 0, change_abs: 0, data: [] })
  }
}
