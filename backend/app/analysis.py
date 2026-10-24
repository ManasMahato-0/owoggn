"""Forecast selection and accuracy metrics. Pure pandas, no I/O beyond loading the snapshot.

Conventions
-----------
* All timestamps are UTC (== UK local time in January).
* error = forecast - actual  (MW). Positive => wind under-delivered => buyer is short.
* Forecasts are hourly; actuals are half-hourly and averaged to the hour they fall in.
"""
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache

import numpy as np
import pandas as pd

from app import config


# ---------------------------------------------------------------- loading

@lru_cache(maxsize=1)
def load_actuals_hourly() -> pd.Series:
    """Hourly mean wind outturn, indexed by hour start."""
    df = pd.read_csv(config.ACTUALS_CSV, parse_dates=["start_time"])
    s = df.set_index("start_time")["generation"]
    return s.resample("1h").mean().dropna()


@lru_cache(maxsize=1)
def load_forecasts() -> pd.DataFrame:
    return pd.read_csv(config.FORECASTS_CSV, parse_dates=["publish_time", "start_time"])


def delivery_window() -> tuple[pd.Timestamp, pd.Timestamp]:
    start = pd.Timestamp(config.FIRST_DELIVERY_DAY, tz="UTC")
    end = pd.Timestamp(config.LAST_DELIVERY_DAY, tz="UTC") + pd.Timedelta(days=1)
    return start, end


# ---------------------------------------------------------------- selection

def _latest_per_target(fc: pd.DataFrame) -> pd.DataFrame:
    """For each start_time keep the row from the most recent publish."""
    idx = fc.groupby("start_time")["publish_time"].idxmax()
    return fc.loc[idx].sort_values("start_time")


def _attach_actuals(sel: pd.DataFrame) -> pd.DataFrame:
    actual = load_actuals_hourly()
    out = sel.rename(columns={"generation": "forecast"}).copy()
    out["actual"] = out["start_time"].map(actual)
    out["error"] = out["forecast"] - out["actual"]
    return out.reset_index(drop=True)


def cutoff_datetime(day: date, cutoff: time) -> pd.Timestamp:
    return pd.Timestamp(datetime.combine(day - timedelta(days=1), cutoff, tzinfo=timezone.utc))


def select_for_day(day: date, cutoff: time, forecasts: pd.DataFrame | None = None) -> pd.DataFrame:
    """Forecast a buyer could see at D-1 `cutoff` for every hour of delivery day `day`."""
    fc = load_forecasts() if forecasts is None else forecasts
    cut = cutoff_datetime(day, cutoff)
    day_start = pd.Timestamp(day, tz="UTC")
    day_end = day_start + pd.Timedelta(days=1)
    fc = fc[
        (fc["publish_time"] <= cut)
        & (fc["start_time"] >= day_start)
        & (fc["start_time"] < day_end)
    ]
    if fc.empty:
        return fc.assign(actual=[], error=[]).rename(columns={"generation": "forecast"})
    return _attach_actuals(_latest_per_target(fc))


def select_for_month(cutoff: time) -> pd.DataFrame:
    """select_for_day over every delivery day in scope, concatenated."""
    start, end = delivery_window()
    days = pd.date_range(start, end, freq="1D", inclusive="left").date
    fc = load_forecasts()
    return pd.concat([select_for_day(d, cutoff, fc) for d in days], ignore_index=True)


def select_at_horizon(horizon_h: float, forecasts: pd.DataFrame | None = None) -> pd.DataFrame:
    """Per target hour, the latest forecast published at least `horizon_h` hours before it."""
    fc = load_forecasts() if forecasts is None else forecasts
    start, end = delivery_window()
    fc = fc[(fc["horizon_h"] >= horizon_h) & (fc["start_time"] >= start) & (fc["start_time"] < end)]
    return _attach_actuals(_latest_per_target(fc))


# ---------------------------------------------------------------- metrics

def compute_metrics(df: pd.DataFrame) -> dict:
    d = df.dropna(subset=["error"])
    if d.empty:
        return {"n": 0}
    e = d["error"].to_numpy()
    mean_actual = float(d["actual"].mean())
    q = np.percentile(e, [10, 50, 90, 95])
    return {
        "n": int(len(e)),
        "mae": float(np.abs(e).mean()),
        "rmse": float(np.sqrt((e**2).mean())),
        "bias": float(e.mean()),
        "nmae_pct": float(np.abs(e).mean() / mean_actual * 100) if mean_actual else None,
        "mean_actual": mean_actual,
        "p10": float(q[0]),
        "p50": float(q[1]),
        "p90": float(q[2]),
        "p95": float(q[3]),
        "max_over": float(e.max()),
        "max_under": float(e.min()),
    }


def metrics_by_horizon(max_h: int = config.MAX_HORIZON_HOURS) -> list[dict]:
    fc = load_forecasts()
    return [{"horizon_h": h, **compute_metrics(select_at_horizon(h, fc))} for h in range(0, max_h + 1)]


def metrics_by_hour_of_day(df: pd.DataFrame) -> list[dict]:
    hours = df["start_time"].dt.hour
    return [{"hour": int(h), **compute_metrics(g)} for h, g in df.groupby(hours)]


def error_histogram(df: pd.DataFrame, bin_mw: int = 500) -> list[dict]:
    e = df["error"].dropna()
    if e.empty:
        return []
    lo = int(np.floor(e.min() / bin_mw) * bin_mw)
    hi = int(np.ceil(e.max() / bin_mw) * bin_mw) + bin_mw
    counts, edges = np.histogram(e, bins=np.arange(lo, hi + 1, bin_mw))
    return [{"bin_start": int(a), "bin_end": int(b), "count": int(c)} for a, b, c in zip(edges[:-1], edges[1:], counts)]
