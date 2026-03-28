import yahooFinance from 'yahoo-finance2'

export default async function handler(req, res) {
  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ error: 'ticker required' })

  const sym = ticker.toUpperCase()

  try {
    const [summary, search] = await Promise.allSettled([
      yahooFinance.quoteSummary(sym, {
        modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'assetProfile', 'calendarEvents'],
        validateResult: false,
      }),
      yahooFinance.search(sym, { quotesCount: 1, newsCount: 0 }),
    ])

    const s   = summary.status === 'fulfilled' ? summary.value : {}
    const price   = s.price            ?? {}
    const detail  = s.summaryDetail    ?? {}
    const stats   = s.defaultKeyStatistics ?? {}
    const profile = s.assetProfile     ?? {}
    const cal     = s.calendarEvents   ?? {}

    // Upcoming earnings date only
    let earningsDate = null
    const today = new Date()
    for (const ed of (cal.earnings?.earningsDate ?? [])) {
      const d = ed instanceof Date ? ed : new Date(ed)
      if (d >= today) {
        earningsDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        break
      }
    }

    const currentPrice = price.regularMarketPrice
    const prevClose    = price.regularMarketPreviousClose
    const dayChangePct = currentPrice != null && prevClose
      ? parseFloat(((currentPrice - prevClose) / prevClose * 100).toFixed(2))
      : null

    // Normalise dividend yield — yfinance sometimes returns decimal (0.056) sometimes pct (5.6)
    const rawDy = detail.dividendYield ?? detail.trailingAnnualDividendYield ?? null

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')
    res.json({
      ticker: sym,
      price:            currentPrice ?? null,
      day_change_pct:   dayChangePct,
      day_low:          price.regularMarketDayLow          ?? null,
      day_high:         price.regularMarketDayHigh         ?? null,
      week_52_low:      detail.fiftyTwoWeekLow             ?? null,
      week_52_high:     detail.fiftyTwoWeekHigh            ?? null,
      volume:           price.regularMarketVolume          ?? null,
      avg_volume:       detail.averageVolume               ?? null,
      market_cap:       price.marketCap                    ?? null,
      pe_ratio:         detail.trailingPE ?? detail.forwardPE ?? null,
      eps:              stats.trailingEps                  ?? null,
      market_beta:      detail.beta                        ?? null,
      dividend_yield:   rawDy,
      forward_dividend: detail.dividendRate                ?? null,
      earnings_date:    earningsDate,
      description:      profile.longBusinessSummary        ?? null,
    })
  } catch (err) {
    console.error('quote error', sym, err.message)
    res.status(500).json({ error: 'Failed to fetch quote' })
  }
}
