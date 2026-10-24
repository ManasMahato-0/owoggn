"""Fetch January 2026 wind data from Elexon, clean it, save CSV snapshots.

Usage (from backend/):  python -m app.etl
"""
import logging

import pandas as pd

from app import config
from app.elexon_client import fetch_wind_actuals, fetch_wind_forecasts

log = logging.getLogger(__name__)


def clean_actuals(records: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(records, columns=["startTime", "publishTime", "generation"])
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    # A revised outturn supersedes the earlier one.
    df = df.sort_values("publishTime").drop_duplicates("startTime", keep="last")
    df = df[(df["startTime"] >= config.ACTUALS_FROM) & (df["startTime"] < config.ACTUALS_TO)]
    return (
        df[["startTime", "generation"]]
        .rename(columns={"startTime": "start_time"})
        .sort_values("start_time")
        .reset_index(drop=True)
    )


def clean_forecasts(records: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(records, columns=["publishTime", "startTime", "generation"])
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    df = df.drop_duplicates(["publishTime", "startTime"], keep="last")
    df = df[
        (df["publishTime"] >= config.FORECAST_PUBLISH_FROM)
        & (df["publishTime"] < config.FORECAST_PUBLISH_TO)
    ]
    # Rows targeting the past are not forecasts; keeping them inflates accuracy.
    df = df[df["startTime"] >= df["publishTime"]].copy()
    df["horizon_h"] = (df["startTime"] - df["publishTime"]).dt.total_seconds() / 3600
    return (
        df.rename(columns={"publishTime": "publish_time", "startTime": "start_time"})
        [["publish_time", "start_time", "horizon_h", "generation"]]
        .sort_values(["publish_time", "start_time"])
        .reset_index(drop=True)
    )


def report_gaps(actuals: pd.DataFrame) -> None:
    expected = pd.date_range(config.ACTUALS_FROM, config.ACTUALS_TO, freq="30min", inclusive="left")
    missing = expected.difference(actuals["start_time"])
    if len(missing):
        log.warning("actuals missing %d half-hours, e.g. %s", len(missing), list(missing[:5]))


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)

    log.info("fetching actuals ...")
    actuals = clean_actuals(fetch_wind_actuals(config.ACTUALS_FROM, config.ACTUALS_TO))
    report_gaps(actuals)
    actuals.to_csv(config.ACTUALS_CSV, index=False)
    log.info("actuals: %d rows -> %s", len(actuals), config.ACTUALS_CSV)

    log.info("fetching forecasts ...")
    forecasts = clean_forecasts(
        fetch_wind_forecasts(config.FORECAST_PUBLISH_FROM, config.FORECAST_PUBLISH_TO)
    )
    forecasts.to_csv(config.FORECASTS_CSV, index=False)
    log.info(
        "forecasts: %d rows, %d publishes, horizon %.1f-%.1fh -> %s",
        len(forecasts),
        forecasts["publish_time"].nunique(),
        forecasts["horizon_h"].min(),
        forecasts["horizon_h"].max(),
        config.FORECASTS_CSV,
    )


if __name__ == "__main__":
    main()
