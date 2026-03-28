// Yahoo Finance RSS feed — no auth needed
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

function parseRSS(xml) {
  const items = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const title     = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
                   ?? block.match(/<title>(.*?)<\/title>/)?.[1]
                   ?? ''
    const link      = block.match(/<link>(.*?)<\/link>/)?.[1]
                   ?? block.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/)?.[1]
                   ?? ''
    const pubDate   = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? null
    const source    = block.match(/<source[^>]*>(.*?)<\/source>/)?.[1]
                   ?? block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]?.slice(0, 40)
                   ?? 'Yahoo Finance'

    if (title) {
      items.push({
        title:        title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').slice(0, 140),
        url:          link,
        source:       source.replace(/&amp;/g, '&').slice(0, 60),
        published_at: pubDate,
        sentiment:    sentiment(title),
      })
    }
    if (items.length === 4) break
  }
  return items
}

export default async function handler(req, res) {
  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ error: 'ticker required' })

  const sym = ticker.toUpperCase()
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${sym}&region=US&lang=en-US`

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; stock-swipe/1.0)' },
    })

    if (!r.ok) {
      console.error('news fetch failed', sym, r.status)
      return res.json({ ticker: sym, articles: [] })
    }

    const xml      = await r.text()
    const articles = parseRSS(xml)

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')
    res.json({ ticker: sym, articles })
  } catch (err) {
    console.error('news error', sym, err.message)
    res.json({ ticker: sym, articles: [] })
  }
}
