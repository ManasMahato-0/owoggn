"""Central settings. Every tunable constant lives here."""
from datetime import datetime, time, timezone
from pathlib import Path

ELEXON_BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"

# Purchase decisions made in January 2026 => delivery days 2 Jan .. 1 Feb.
# Forecasts published 31 Dec .. 31 Jan feed those decisions;
# actuals for the delivery days are needed to score them.
# Note: each WINDFOR publish ends at 21:00 two days later, so late-evening
# targets never get a >=48h-ahead forecast (n drops near 48h; that is structural).
FORECAST_PUBLISH_FROM = datetime(2025, 12, 31, tzinfo=timezone.utc)
FORECAST_PUBLISH_TO = datetime(2026, 2, 1, tzinfo=timezone.utc)
ACTUALS_FROM = datetime(2026, 1, 1, tzinfo=timezone.utc)
ACTUALS_TO = datetime(2026, 2, 2, tzinfo=timezone.utc)

FIRST_DELIVERY_DAY = "2026-01-02"
LAST_DELIVERY_DAY = "2026-02-01"

# Default decision cutoff on D-1 (UK local; GMT == UTC in January).
DEFAULT_CUTOFF = time(9, 0)

# WINDFOR publishes up to ~48h+ ahead.
MAX_HORIZON_HOURS = 48
DEFAULT_HORIZON_HOURS = 24

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
ACTUALS_CSV = DATA_DIR / "actuals.csv"
FORECASTS_CSV = DATA_DIR / "forecasts.csv"
