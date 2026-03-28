CREATE TABLE IF NOT EXISTS STOCKS (
  ticker            VARCHAR(10)   PRIMARY KEY,
  name              VARCHAR(100),
  sector            VARCHAR(50),
  vector            ARRAY,                        -- 6-dim normalized float array
  alpha             FLOAT         DEFAULT 1.0,    -- Thompson Sampling: right swipes
  beta              FLOAT         DEFAULT 1.0,    -- Thompson Sampling: left swipes
  price             FLOAT,
  market_cap        FLOAT,
  pe_ratio          FLOAT,
  dividend_yield    FLOAT,
  momentum_30d      FLOAT,
  volatility_30d    FLOAT,
  esg_score         FLOAT,
  sentiment_score   FLOAT,
  -- enriched fields
  description       VARCHAR(500),
  day_low           FLOAT,
  day_high          FLOAT,
  week_52_low       FLOAT,
  week_52_high      FLOAT,
  volume            FLOAT,
  avg_volume        FLOAT,
  market_beta       FLOAT,                        -- 5Y monthly beta (vs market)
  eps               FLOAT,
  forward_dividend  FLOAT,
  ex_dividend_date  VARCHAR(20),
  analyst_target    FLOAT,
  earnings_date     VARCHAR(20),
  float_shares      FLOAT,
  short_ratio       FLOAT,
  day_change_pct    FLOAT,
  updated_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS USERS (
  user_id      VARCHAR(36)  PRIMARY KEY,          -- UUID
  user_vector  ARRAY,                             -- 6-dim float array
  swipe_count  INT          DEFAULT 0,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS SWIPES (
  id         INT AUTOINCREMENT PRIMARY KEY,
  user_id    VARCHAR(36),
  ticker     VARCHAR(10),
  direction  VARCHAR(5),                          -- 'right' or 'left'
  swiped_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
