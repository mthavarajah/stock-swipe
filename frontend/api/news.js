import yahooFinance from 'yahoo-finance2'

// Lightweight keyword sentiment — avoids adding an npm dep just for this
function sentiment(text) {
  const pos = ['up', 'gain', 'rise', 'rises', 'growth', 'profit', 'beats', 'beat',
               'surge', 'strong', 'record', 'high', 'boost', 'rally', 'wins', 'buy']
  const neg = ['down', 'fall', 'falls', 'loss', 'losses', 'decline', 'miss', 'misses',
               'drop', 'drops', 'weak', 'cut', 'low', 'risk', 'concern', 'sell', 'crash']
  const lower = (text ?? '').toLowerCase()
  let score = 0
  for (const w of pos) if (lower.includes(w)) score++
  for (const w of neg) if (lower.includes(w)) score--
  return score > 0 ? 0.5 : score < 0 ? -0.5 : 0
}

export default async function handler(req, res) {
  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ error: 'ticker required' })

  const sym = ticker.toUpperCase()

  try {
    const result = await yahooFinance.search(sym, {
      newsCount:   4,
      quotesCount: 0,
      validateResult: false,
    })

    const articles = (result.news ?? []).slice(0, 4).map(item => ({
      title:        item.title        ?? '',
      url:          item.link         ?? '',
      source:       item.publisher    ?? '',
      published_at: item.providerPublishTime ?? null,
      sentiment:    sentiment(item.title),
    }))

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')
    res.json({ ticker: sym, articles })
  } catch (err) {
    console.error('news error', sym, err.message)
    res.json({ ticker: sym, articles: [] })
  }
}
