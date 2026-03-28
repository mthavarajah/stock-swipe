// Yahoo Finance v8 chart API — no crumb/auth needed
export default async function handler(req, res) {
  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ error: 'ticker required' })

  const sym = ticker.toUpperCase()
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1d&interval=1m&includePrePost=false`

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    })

    if (!r.ok) {
      console.error('quote fetch failed', sym, r.status)
      return res.json({ ticker: sym, price: null, day_change_pct: null })
    }

    const json = await r.json()
    const meta = json?.chart?.result?.[0]?.meta ?? {}

    const currentPrice = meta.regularMarketPrice ?? null
    const prevClose    = meta.previousClose ?? meta.chartPreviousClose ?? null
    const dayChangePct = currentPrice != null && prevClose
      ? parseFloat(((currentPrice - prevClose) / prevClose * 100).toFixed(2))
      : null

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate')
    res.json({
      ticker:          sym,
      price:           currentPrice,
      day_change_pct:  dayChangePct,
      day_low:         meta.regularMarketDayLow    ?? null,
      day_high:        meta.regularMarketDayHigh   ?? null,
      week_52_low:     meta.fiftyTwoWeekLow        ?? null,
      week_52_high:    meta.fiftyTwoWeekHigh       ?? null,
      volume:          meta.regularMarketVolume    ?? null,
      // Fields below are not in the chart API — frontend falls back to Snowflake snapshot
      avg_volume:      null,
      market_cap:      null,
      pe_ratio:        null,
      eps:             null,
      market_beta:     null,
      dividend_yield:  null,
      forward_dividend: null,
      earnings_date:   null,
      description:     null,
    })
  } catch (err) {
    console.error('quote error', sym, err.message)
    res.json({ ticker: sym, price: null, day_change_pct: null })
  }
}
