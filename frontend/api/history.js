// Yahoo Finance v8 chart API — no crumb/auth needed
const CONFIGS = {
  '1D':  { range: '1d',   interval: '5m'  },
  '5D':  { range: '5d',   interval: '60m' },
  '1M':  { range: '1mo',  interval: '1d'  },
  '6M':  { range: '6mo',  interval: '1d'  },
  'YTD': { range: 'ytd',  interval: '1d'  },
  '1Y':  { range: '1y',   interval: '1wk' },
  '5Y':  { range: '5y',   interval: '1mo' },
  'All': { range: 'max',  interval: '3mo' },
}

export default async function handler(req, res) {
  const { ticker, period = '1M' } = req.query
  if (!ticker) return res.status(400).json({ error: 'ticker required' })

  const sym    = ticker.toUpperCase()
  const config = CONFIGS[period] ?? CONFIGS['1M']
  const url    = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${config.range}&interval=${config.interval}&includePrePost=false`

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    })

    if (!r.ok) {
      console.error('history fetch failed', sym, period, r.status)
      return res.json({ ticker: sym, period, change_pct: 0, change_abs: 0, data: [] })
    }

    const json      = await r.json()
    const result    = json?.chart?.result?.[0]
    const timestamps = result?.timestamp ?? []
    const quotes    = result?.indicators?.quote?.[0] ?? {}
    const adjclose  = result?.indicators?.adjclose?.[0]?.adjclose ?? []

    const rows = []
    for (let i = 0; i < timestamps.length; i++) {
      const close = adjclose[i] ?? quotes.close?.[i]
      if (close == null || isNaN(close)) continue
      rows.push({
        date:   new Date(timestamps[i] * 1000).toISOString(),
        close:  parseFloat(close.toFixed(4)),
        open:   quotes.open?.[i]   != null ? parseFloat(quotes.open[i].toFixed(4))   : null,
        high:   quotes.high?.[i]   != null ? parseFloat(quotes.high[i].toFixed(4))   : null,
        low:    quotes.low?.[i]    != null ? parseFloat(quotes.low[i].toFixed(4))    : null,
        volume: quotes.volume?.[i] ?? null,
      })
    }

    if (rows.length < 2) {
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
    res.json({ ticker: sym, period, change_pct: 0, change_abs: 0, data: [] })
  }
}
