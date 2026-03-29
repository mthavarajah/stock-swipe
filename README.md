# Stock Swipe

A Tinder-style stock discovery app that learns your investment taste in real time.

**[▶ Watch Demo Video](YOUR_DEMO_VIDEO_LINK_HERE)**

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
| Data       | yfinance, Alpaca Data API, TextBlob                |
| Database   | Snowflake                                          |
| ML         | numpy, scikit-learn, scipy                         |
| Backend    | FastAPI, Python 3.11, snowflake-connector-python   |
| Frontend   | React 18, Vite, Framer Motion, Recharts, Tailwind  |
### Architecture

```
Browser
  ├── /api/news              →  Serverless function (Google News RSS)
  └── /onboard, /swipe,
      /next-batch, /stock/*  →  FastAPI backend (Snowflake + Alpaca)
```

ML scoring and user profiles run on the backend backed by Snowflake.
Chart and quote data is served via Alpaca's Data API (cloud IP-friendly).
News is fetched from Google News RSS via a serverless function.

---

## Local development

### Prerequisites

- Python 3.11+
- Node 18+
- A Snowflake account
- An Alpaca paper trading account (free) for market data


### 1 — Snowflake setup

1. Create warehouse `STOCK_SWIPE_WH` (X-Small), database `STOCK_SWIPE_DB`, schema `PUBLIC`
2. Run `backend/db/schema.sql` to create the three tables

### 2 — Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # fill in Snowflake + Alpaca credentials
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

---

## Project structure

```
stock-swipe/
├── backend/
│   ├── main.py              # FastAPI app — ML + market data endpoints
│   ├── model/
│   │   ├── vectors.py       # cosine similarity + user vector updates
│   │   ├── bandit.py        # Thompson Sampling
│   │   └── scorer.py        # hybrid combiner + batch generator
│   ├── data/
│   │   ├── fetch.py         # Alpaca + yfinance fetcher, Wikipedia descriptions
│   │   ├── features.py      # 6-dim feature engineering + normalisation
│   │   └── pipeline.py      # orchestrator — run to seed Snowflake
│   └── db/
│       ├── snowflake.py     # connection + query helpers
│       └── schema.sql       # STOCKS, USERS, SWIPES tables
└── frontend/
    ├── api/
    │   └── news.js          # News via Google News RSS
    └── src/
        ├── components/      # SwipeCard, SwipeStack, StockChart, IndexChart, …
        ├── pages/           # Onboard, Swipe, Portfolio, Index
        ├── api/client.js    # axios wrapper — routes ML/data and news for deployment
        └── store/           # zustand session store
```
