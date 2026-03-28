import yf from 'yahoo-finance2'
const yahooFinance = yf.default ?? yf

export default async function handler(req, res) {
  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ error: 'ticker required' })

  const sym = ticker.toUpperCase()

  try {
    // quote() is lightweight and reliable — covers all price/fundamentals fields
    const q = await yahooFinance.quote(sym, {}, { validateResult: false })

    // Fetch description separately — non-fatal if it fails
    let description = null
    try {
      const profile = await yahooFinance.quoteSummary(sym, {
        modules: ['assetProfile'],
        validateResult: false,
      })
      description = profile?.assetProfile?.longBusinessSummary ?? null
    } catch (_) {}

    // Upcoming earnings date
    let earningsDate = null
    try {
      const cal = await yahooFinance.quoteSummary(sym, {
        modules: ['calendarEvents'],
        validateResult: false,
      })
      const today = new Date()
      for (const ed of (cal?.calendarEvents?.earnings?.earningsDate ?? [])) {
        const d = ed instanceof Date ? ed : new Date(ed)
        if (d >= today) {
          earningsDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          break
        }
      }
    } catch (_) {}

    const currentPrice = q.regularMarketPrice
    const prevClose    = q.regularMarketPreviousClose
    const dayChangePct = currentPrice != null && prevClose
      ? parseFloat(((currentPrice - prevClose) / prevClose * 100).toFixed(2))
      : null

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')
    res.json({
      ticker:           sym,
      price:            currentPrice             ?? null,
      day_change_pct:   dayChangePct,
      day_low:          q.regularMarketDayLow    ?? null,
      day_high:         q.regularMarketDayHigh   ?? null,
      week_52_low:      q.fiftyTwoWeekLow        ?? null,
      week_52_high:     q.fiftyTwoWeekHigh       ?? null,
      volume:           q.regularMarketVolume    ?? null,
      avg_volume:       q.averageDailyVolume3Month ?? null,
      market_cap:       q.marketCap              ?? null,
      pe_ratio:         q.trailingPE ?? q.forwardPE ?? null,
      eps:              q.epsTrailingTwelveMonths ?? null,
      market_beta:      q.beta                   ?? null,
      dividend_yield:   q.dividendYield          ?? null,
      forward_dividend: q.dividendRate           ?? null,
      earnings_date:    earningsDate,
      description:      description,
    })
  } catch (err) {
    console.error('quote error', sym, err.message)
    // Return partial data rather than error — frontend will show what it has
    res.json({ ticker: sym, price: null, day_change_pct: null })
  }
}
