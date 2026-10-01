-- Display currency per user (prices are always stored in RSD) and the daily NBS exchange rate
ALTER TABLE users ADD COLUMN currency text NOT NULL DEFAULT 'RSD' CHECK (currency IN ('RSD', 'EUR'));

CREATE TABLE fx_rates (
  day         date NOT NULL,
  currency    text NOT NULL,
  rate        numeric(10, 4) NOT NULL,   -- RSD for 1 unit of the currency (NBS middle rate)
  source      text NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, currency)
);
