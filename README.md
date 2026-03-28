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
| Data       | yfinance, NewsAPI, TextBlob                        |
| Database   | Snowflake (free trial)                             |
| ML         | numpy, scikit-learn, scipy                         |
| Backend    | FastAPI, Python 3.11, snowflake-connector-python   |
| Frontend   | React 18, Vite, Framer Motion, Recharts, Tailwind  |
| Deploy     | Railway (backend), Vercel (frontend)               |

---

## Local development

### Prerequisites

- Python 3.11+
- Node 18+
- A Snowflake free-trial account
- A NewsAPI key (free tier)

### 1 — Snowflake setup

1. Create warehouse `STOCK_SWIPE_WH` (X-Small), database `STOCK_SWIPE_DB`, schema `PUBLIC`
2. Run `backend/db/schema.sql` to create the three tables

### 2 — Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # fill in your credentials
```

Seed the database (runs once, ~10–15 min for all S&P 500 tickers):

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

cp .env.example .env.local
# Set: VITE_API_URL=http://localhost:8000

npm run dev
# App at http://localhost:5173
```

---

## Deployment

### Backend → Railway

```bash
cd backend
railway login
railway init
railway up
```

Set env vars in the Railway dashboard (see `backend/.env.example`), then seed:

```bash
railway run python data/pipeline.py
```

### Frontend → Vercel

```bash
cd frontend
vercel
```

Set `VITE_API_URL=https://your-railway-url.up.railway.app` in the Vercel dashboard, then:

```bash
vercel --prod
```

---

## Project structure

```
stock-swipe/
├── backend/
│   ├── main.py              # FastAPI app — 4 endpoints
│   ├── model/
│   │   ├── vectors.py       # cosine similarity + user vector updates
│   │   ├── bandit.py        # Thompson Sampling
│   │   └── scorer.py        # hybrid combiner + batch generator
│   ├── data/
│   │   ├── fetch.py         # yfinance + NewsAPI fetcher
│   │   ├── features.py      # 6-dim feature engineering + normalisation
│   │   └── pipeline.py      # orchestrator — run to seed Snowflake
│   └── db/
│       ├── snowflake.py     # connection + query helpers
│       └── schema.sql       # STOCKS, USERS, SWIPES tables
└── frontend/
    └── src/
        ├── components/      # SwipeCard, SwipeStack, ConvergenceBar, …
        ├── pages/           # Onboard, Swipe, Playlist
        ├── api/client.js    # axios wrapper
        └── store/           # zustand session store
```
