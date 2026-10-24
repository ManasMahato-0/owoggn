# Wind Forecast Monitor

A web app that helps a UK utility's day-ahead trading desk answer two questions for **January 2026**:

1. **What did the latest wind forecast say when I had to buy?** For any delivery day, it shows the most recent Elexon WINDFOR forecast published before the D-1 decision cutoff, with a P10–P90 likely-range band.
2. **How far can I trust it?** It shows forecast error (MAE, RMSE, bias, nMAE, error quantiles) at the chosen cutoff, how error grows with lead time, how it varies by hour of day, and a P90 "extra cover" figure that turns the error into MW to procure.

**Live app:** https://owoggn.vercel.app

Data: Elexon BMRS [FUELHH](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) (actual generation, `fuelType=WIND`) and [WINDFOR](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream) (wind forecasts). National level only.

---

## Running it

### Docker (recommended)

```bash
docker compose up --build
# open http://localhost:8080
```

### Without Docker

```bash
# backend (terminal 1)
cd backend
pip install -r requirements-dev.txt
uvicorn app.main:app --port 8000

# frontend (terminal 2)
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /api to :8000
```

### Tests

```bash
cd backend && python -m pytest -q
```

### Refreshing the data snapshot

The January data is historical, so it is fetched once and committed as CSV (`backend/data/`). To rebuild it:

```bash
cd backend && python -m app.etl
```

---

## Repository layout

```
backend/
  app/
    config.py          All constants: API base URL, data windows, default cutoff, max horizon
    elexon_client.py   HTTP client for Elexon stream endpoints (day-chunked, retry with backoff)
    etl.py             Fetch -> clean -> dedupe -> write CSV snapshot; reports data gaps
    analysis.py        Pure pandas: forecast selection (cutoff / horizon), alignment, metrics
    schemas.py         Pydantic response models (the API contract)
    main.py            FastAPI routes (thin: validate, call analysis, shape response)
  data/
    actuals.csv        FUELHH wind, half-hourly, 1 Jan – 1 Feb 2026 (1,536 rows)
    forecasts.csv      WINDFOR, publishes 31 Dec – 31 Jan, horizon >= 0 (14,847 rows)
  tests/               pytest: selection logic (no lookahead), metrics math, API contract
  Dockerfile
  requirements.txt     Pinned runtime deps (requirements-dev.txt adds pytest)
frontend/
  src/
    api.ts             Typed API client; types mirror backend/app/schemas.py
    App.tsx            Shell: tabs, shared delivery-day / cutoff state
    pages/
      DecisionPage.tsx Forecast at cutoff vs actual, P10–P90 band, KPIs, hourly table
      AccuracyPage.tsx Error KPIs, error-vs-lead-time, error by hour, error histogram
    components/ui.tsx  Kpi, Card, Status, ChartTooltip
    useFetch.ts        Minimal data-fetch hook (drops stale responses)
    format.ts          Number / time formatters (Europe/London)
    index.css          Design tokens (light + dark), layout
  Dockerfile           Multi-stage: node build -> nginx static
  nginx.conf           Serves SPA, proxies /api to backend container
api/index.py           Vercel serverless entry: re-exports the FastAPI app
vercel.json            Vercel build + /api rewrite + bundles backend/ into the function
docker-compose.yml     backend + frontend, app on :8080
requirements.txt       Copy of backend deps for the Vercel Python runtime (keep in sync)
```

---

## API

| Endpoint | Returns |
|---|---|
| `GET /api/meta` | Delivery-day range, default cutoff, WINDFOR publish slots |
| `GET /api/day?date=YYYY-MM-DD&cutoff=HH:MM` | 24 hourly rows (forecast used, publish time, lead time, actual, error, P10–P90 band), day metrics, P90 buffer, January bias |
| `GET /api/accuracy?cutoff=HH:MM` | January metrics at that cutoff, by hour of day, error histogram |
| `GET /api/accuracy/horizon` | Metrics for lead times 0–48h |

Interactive docs: `/docs` (FastAPI Swagger UI).

---

## Analysis decisions

| Topic | Decision | Why |
|---|---|---|
| Scope | Delivery days **2 Jan – 1 Feb 2026** | Decisions are made on D-1, so decisions "made in January" deliver on those days |
| Decision cutoff | Default **09:00 UK on D-1**, user-adjustable | Close to GB day-ahead auction gate closure; desks differ, so it is a control |
| Forecast used | Latest publish with `publishTime <= cutoff` | Exactly what the buyer could see. No lookahead (unit-tested) |
| Past-dated forecast rows | Dropped (`startTime < publishTime`) | They are not forecasts and would flatter accuracy |
| Resolution mismatch | Hourly forecast vs **mean of the two half-hourly actuals** in that hour | Both are MW averages over the hour |
| Error sign | `error = forecast − actual` | Positive = wind short of forecast = buyer is short. Matches the desk's risk |
| Accuracy metric | MAE, RMSE, bias, **nMAE** (MAE / mean actual), P10/P50/P90/P95 | MAPE explodes at low wind; quantiles give a direct cover figure |
| Uncertainty band | Forecast − P90 … forecast − P10 of January errors at the same cutoff | Simple, explainable. In-sample for a one-month pilot; production would use a rolling window |
| Lead-time curve | Per target hour, latest forecast with lead >= h | Standard forecast-skill view. `n` falls near 48h because each WINDFOR publish ends at 21:00 two days later, so this is structural, not missing data |
| Storage | Committed CSV snapshot, cached in memory | January is frozen history. Avoids 60+ upstream calls per cold start; parquet skipped to keep the serverless bundle small |

### Key findings (cutoff 09:00 D-1)

- Forecasts **over-predicted wind by about 1.75 GW on average** (bias), roughly 15% of mean output. A likely contributor is curtailment and constraints: WINDFOR forecasts available output, while FUELHH records metered output. This hypothesis needs confirming against BM curtailment data.
- MAE is about **2.0 GW (18% of mean output)**, rising from 1.7 GW at 0h lead time to 2.3 GW at 48h.
- **P90 shortfall is about 4.1 GW**: planning that much cover beyond the forecast would have covered 90% of January hours.
- Error is highest in the early morning (03:00–06:00).

### Known limitations / next steps

- National wind only. No demand data, so the app quantifies wind-supply uncertainty, not total net procurement.
- One month of data, so the band and buffer are in-sample. Next steps: a rolling-window calibration and a bias-corrected forecast.
- Times shown in Europe/London (identical to UTC in January).

---

## Use of AI tools

This project was built with help from **Claude Code (Anthropic)** for design discussion, code generation, and documentation. All code, analysis choices and figures were reviewed, run and verified locally (tests, API smoke checks, rendered screenshots).
