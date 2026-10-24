"""FastAPI app. Routes are thin: validate input, call analysis, shape the response."""
from datetime import date, time
from functools import lru_cache

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app import analysis, config
from app.schemas import AccuracyResponse, DayResponse, HorizonMetrics, Meta

app = FastAPI(title="Wind Forecast Monitor", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])

CUTOFF_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"


def _parse_cutoff(cutoff: str) -> time:
    h, m = cutoff.split(":")
    return time(int(h), int(m))


def _none_if_nan(v):
    return None if v is None or pd.isna(v) else float(v)


@lru_cache(maxsize=64)
def _month(cutoff: time) -> pd.DataFrame:
    return analysis.select_for_month(cutoff)


@lru_cache(maxsize=64)
def _month_metrics(cutoff: time) -> dict:
    return analysis.compute_metrics(_month(cutoff))


@lru_cache(maxsize=1)
def _horizon_curve() -> list[dict]:
    return analysis.metrics_by_horizon()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/meta", response_model=Meta)
def meta():
    publishes = analysis.load_forecasts()["publish_time"].dt.strftime("%H:%M")
    return Meta(
        first_delivery_day=config.FIRST_DELIVERY_DAY,
        last_delivery_day=config.LAST_DELIVERY_DAY,
        default_cutoff=config.DEFAULT_CUTOFF.strftime("%H:%M"),
        max_horizon_h=config.MAX_HORIZON_HOURS,
        publish_times_per_day=sorted(publishes.unique()),
    )


@app.get("/api/day", response_model=DayResponse)
def day_view(
    date_: date = Query(..., alias="date"),
    cutoff: str = Query(config.DEFAULT_CUTOFF.strftime("%H:%M"), pattern=CUTOFF_PATTERN),
):
    if not (config.FIRST_DELIVERY_DAY <= date_.isoformat() <= config.LAST_DELIVERY_DAY):
        raise HTTPException(
            404, f"Delivery day must be between {config.FIRST_DELIVERY_DAY} and {config.LAST_DELIVERY_DAY}"
        )
    cut = _parse_cutoff(cutoff)
    df = analysis.select_for_day(date_, cut)
    month = _month_metrics(cut)
    p10, p90 = month.get("p10", 0.0), month.get("p90", 0.0)

    rows = [
        {
            "start_time": r.start_time,
            "publish_time": r.publish_time,
            "horizon_h": r.horizon_h,
            "forecast": r.forecast,
            "actual": _none_if_nan(r.actual),
            "error": _none_if_nan(r.error),
            # error = forecast - actual  =>  actual = forecast - error
            "band_low": r.forecast - p90,
            "band_high": r.forecast - p10,
        }
        for r in df.itertuples()
    ]
    return DayResponse(
        date=date_.isoformat(),
        cutoff=analysis.cutoff_datetime(date_, cut),
        latest_publish=df["publish_time"].max() if len(df) else None,
        rows=rows,
        metrics=analysis.compute_metrics(df),
        buffer_p90_mw=month.get("p90"),
        month_bias_mw=month.get("bias"),
    )


@app.get("/api/accuracy", response_model=AccuracyResponse)
def accuracy(cutoff: str = Query(config.DEFAULT_CUTOFF.strftime("%H:%M"), pattern=CUTOFF_PATTERN)):
    cut = _parse_cutoff(cutoff)
    df = _month(cut)
    return AccuracyResponse(
        cutoff=cutoff,
        metrics=_month_metrics(cut),
        by_hour=analysis.metrics_by_hour_of_day(df),
        histogram=analysis.error_histogram(df),
    )


@app.get("/api/accuracy/horizon", response_model=list[HorizonMetrics])
def accuracy_by_horizon():
    return _horizon_curve()
