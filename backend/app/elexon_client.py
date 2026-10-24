"""Thin HTTP client for the Elexon BMRS stream endpoints.

Only responsibility: fetch raw JSON records reliably. No cleaning here.
"""
import logging
import time
from datetime import date, datetime, timedelta

import httpx

from app.config import ELEXON_BASE_URL

log = logging.getLogger(__name__)

MAX_RETRIES = 4
TIMEOUT_S = 30.0


def _get(client: httpx.Client, dataset: str, params: dict) -> list[dict]:
    url = f"{ELEXON_BASE_URL}/{dataset}/stream"
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = client.get(url, params=params, timeout=TIMEOUT_S)
            if resp.status_code == 429 or resp.status_code >= 500:
                raise httpx.HTTPStatusError("retryable", request=resp.request, response=resp)
            resp.raise_for_status()
            return resp.json()
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            if attempt == MAX_RETRIES:
                raise
            wait = 2**attempt
            log.warning("%s %s failed (%s), retry in %ss", dataset, params, exc, wait)
            time.sleep(wait)
    return []  # unreachable


def _days(start: date, end: date):
    d = start
    while d < end:
        yield d
        d += timedelta(days=1)


def fetch_wind_actuals(start: datetime, end: datetime) -> list[dict]:
    """FUELHH half-hourly outturn, WIND only, for settlement dates [start, end)."""
    records: list[dict] = []
    with httpx.Client() as client:
        for d in _days(start.date(), end.date()):
            params = {
                "settlementDateFrom": d.isoformat(),
                "settlementDateTo": d.isoformat(),
                "fuelType": "WIND",
            }
            records.extend(_get(client, "FUELHH", params))
    return records


def fetch_wind_forecasts(start: datetime, end: datetime) -> list[dict]:
    """WINDFOR forecasts with publishTime in [start, end), fetched one day at a time."""
    records: list[dict] = []
    with httpx.Client() as client:
        for d in _days(start.date(), end.date()):
            params = {
                "publishDateTimeFrom": f"{d.isoformat()}T00:00:00Z",
                "publishDateTimeTo": f"{(d + timedelta(days=1)).isoformat()}T00:00:00Z",
            }
            records.extend(_get(client, "WINDFOR", params))
    return records
