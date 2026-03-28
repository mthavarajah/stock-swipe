# Stock Swipe

A Tinder-style stock discovery app that learns your investment taste in real time.

---

## How the ML works

Each stock is represented as a 6-dimensional feature vector `[growth, value, esg, volatility, momentum, dividend]`, and your taste profile is a vector in the same space that updates with every swipe. The recommendation score blends **cosine similarity** (how well a stock matches your taste) with a **Thompson Sampling** bonus from a Beta distribution (to keep surfacing unseen stocks), weighted by an **epsilon decay** term that shifts from pure exploration at 0 swipes toward pure personalisation as you swipe more.

```
score = (1 − ε) × cosine_similarity(you, stock)
      +      ε  × sample(Beta(α, β))

ε = 1 / (1 + 0.1 × swipe_count)
```

---

## Stack

| Layer      | Technology                                         |
|------------|----------------------------------------------------|
| Data       | yfinance, TextBlob                                 |
| Database   | Snowflake                                          |
| ML         | numpy, scikit-learn, scipy                         |
| Backend    | FastAPI, Python 3.11, snowflake-connector-python   |
| Frontend   | React 18, Vite, Framer Motion, Recharts, Tailwind  |
| Deploy     | Render (backend ML), Vercel (frontend + market data) |

### Architecture

```
Browser
  ├── /api/quote, /api/history, /api/news  →  Vercel serverless (yahoo-finance2)
  └── /onboard, /swipe, /next-batch        →  Render (FastAPI + Snowflake ML)
```

Market data (charts, live quotes, news) runs on Vercel's edge — no cold starts.
ML scoring and user profiles run on Render backed by Snowflake.

---

## Local development

### Prerequisites

- Python 3.11+
- Node 18+
- A Snowflake account
- A Render account (for deployment)

### 1 — Snowflake setup

1. Create warehouse `STOCK_SWIPE_WH` (X-Small), database `STOCK_SWIPE_DB`, schema `PUBLIC`
2. Run `backend/db/schema.sql` to create the three tables

### 2 — Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # fill in your Snowflake credentials
```

Seed the database (runs once, ~15–20 min for 100 tickers):

```bash
python -m data.pipeline
```

Start the API server:

```bash
uvicorn main:app --reload --port 8000
# Docs at http://localhost:8000/docs
```

### 3 — Frontend

```bash
cd frontend
npm install

# Create .env.local with:
# VITE_API_URL=http://localhost:8000

npm run dev
# App at http://localhost:5173
```

The Vite dev server proxies `/api/history`, `/api/quote`, `/api/news` to the local
FastAPI backend automatically — no extra setup needed.

---

## Deployment

### Backend → Render

1. Go to [render.com](https://render.com) → New Web Service → connect GitHub repo
2. Set **Root Directory** to `backend`
3. Runtime: **Docker** (picks up `backend/Dockerfile` automatically)
4. Add environment variables (all `SNOWFLAKE_*` keys from `.env.example`)
5. Deploy → copy the service URL

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → import repo
2. Set **Root Directory** to `frontend`
3. Add environment variable:
   ```
   VITE_API_URL=https://your-app.onrender.com
   ```
4. Deploy — Vercel automatically serves `frontend/api/*.js` as serverless functions

---

## Project structure

```
stock-swipe/
├── backend/
│   ├── main.py              # FastAPI app — ML endpoints only
│   ├── model/
│   │   ├── vectors.py       # cosine similarity + user vector updates
│   │   ├── bandit.py        # Thompson Sampling
│   │   └── scorer.py        # hybrid combiner + batch generator
│   ├── data/
│   │   ├── fetch.py         # yfinance fetcher
│   │   ├── features.py      # 6-dim feature engineering + normalisation
│   │   └── pipeline.py      # orchestrator — run to seed Snowflake
│   └── db/
│       ├── snowflake.py     # connection + query helpers
│       └── schema.sql       # STOCKS, USERS, SWIPES tables
└── frontend/
    ├── api/
    │   ├── quote.js         # Vercel serverless — live quote via yahoo-finance2
    │   ├── history.js       # Vercel serverless — OHLCV chart data
    │   └── news.js          # Vercel serverless — news + sentiment
    └── src/
        ├── components/      # SwipeCard, SwipeStack, ConvergenceBar, IndexChart, …
        ├── pages/           # Onboard, Swipe, Portfolio, Index
        ├── api/client.js    # axios wrapper — routes ML to Render, data to Vercel
        └── store/           # zustand session store
```
