"""Pydantic response models: the API contract the frontend relies on."""
from datetime import datetime

from pydantic import BaseModel


class Metrics(BaseModel):
    n: int
    mae: float | None = None
    rmse: float | None = None
    bias: float | None = None
    nmae_pct: float | None = None
    mean_actual: float | None = None
    p10: float | None = None
    p50: float | None = None
    p90: float | None = None
    p95: float | None = None
    max_over: float | None = None
    max_under: float | None = None


class Meta(BaseModel):
    first_delivery_day: str
    last_delivery_day: str
    default_cutoff: str
    max_horizon_h: int
    publish_times_per_day: list[str]


class HourRow(BaseModel):
    start_time: datetime
    publish_time: datetime
    horizon_h: float
    forecast: float
    actual: float | None
    error: float | None
    band_low: float
    band_high: float


class DayResponse(BaseModel):
    date: str
    cutoff: datetime
    latest_publish: datetime | None
    rows: list[HourRow]
    metrics: Metrics
    buffer_p90_mw: float | None
    month_bias_mw: float | None


class HourOfDayMetrics(Metrics):
    hour: int


class HorizonMetrics(Metrics):
    horizon_h: int


class HistogramBin(BaseModel):
    bin_start: int
    bin_end: int
    count: int


class AccuracyResponse(BaseModel):
    cutoff: str
    metrics: Metrics
    by_hour: list[HourOfDayMetrics]
    histogram: list[HistogramBin]
