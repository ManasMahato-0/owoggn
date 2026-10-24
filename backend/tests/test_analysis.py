from datetime import date, time

import pandas as pd
import pytest

from app import analysis

T = lambda s: pd.Timestamp(s, tz="UTC")  # noqa: E731


@pytest.fixture
def actuals(monkeypatch):
    s = pd.Series({T("2026-01-15 00:00"): 1000.0, T("2026-01-15 01:00"): 2000.0})
    monkeypatch.setattr(analysis, "load_actuals_hourly", lambda: s)
    return s


def fc_rows(*rows):
    df = pd.DataFrame(rows, columns=["publish_time", "start_time", "generation"])
    df["publish_time"] = df["publish_time"].map(T)
    df["start_time"] = df["start_time"].map(T)
    df["horizon_h"] = (df["start_time"] - df["publish_time"]).dt.total_seconds() / 3600
    return df


def test_day_selection_never_uses_forecast_after_cutoff(actuals):
    fc = fc_rows(
        ("2026-01-14 07:30", "2026-01-15 00:00", 1100),
        ("2026-01-14 09:01", "2026-01-15 00:00", 9999),  # published after cutoff
    )
    out = analysis.select_for_day(date(2026, 1, 15), time(9, 0), fc)
    assert out["forecast"].tolist() == [1100]


def test_day_selection_takes_latest_publish_before_cutoff(actuals):
    fc = fc_rows(
        ("2026-01-14 04:30", "2026-01-15 01:00", 1500),
        ("2026-01-14 07:30", "2026-01-15 01:00", 2300),
    )
    out = analysis.select_for_day(date(2026, 1, 15), time(9, 0), fc)
    assert out["forecast"].tolist() == [2300]
    assert out["error"].tolist() == [300.0]  # forecast - actual


def test_horizon_selection_respects_minimum_lead(actuals):
    fc = fc_rows(
        ("2026-01-14 00:00", "2026-01-15 00:00", 1200),  # 24h ahead
        ("2026-01-14 12:00", "2026-01-15 00:00", 1050),  # 12h ahead
    )
    assert analysis.select_at_horizon(24, fc)["forecast"].tolist() == [1200]
    assert analysis.select_at_horizon(6, fc)["forecast"].tolist() == [1050]


def test_metrics_math():
    df = pd.DataFrame({"actual": [10.0, 10.0, 10.0, 10.0], "error": [2.0, -2.0, 4.0, 0.0]})
    m = analysis.compute_metrics(df)
    assert m["n"] == 4
    assert m["mae"] == pytest.approx(2.0)
    assert m["bias"] == pytest.approx(1.0)
    assert m["rmse"] == pytest.approx((24 / 4) ** 0.5)
    assert m["nmae_pct"] == pytest.approx(20.0)


def test_metrics_empty():
    assert analysis.compute_metrics(pd.DataFrame({"actual": [], "error": []})) == {"n": 0}


def test_actuals_are_averaged_to_the_hour(tmp_path, monkeypatch):
    csv = tmp_path / "a.csv"
    csv.write_text("start_time,generation\n2026-01-15 00:00:00+00:00,100\n2026-01-15 00:30:00+00:00,200\n")
    monkeypatch.setattr(analysis.config, "ACTUALS_CSV", csv)
    analysis.load_actuals_hourly.cache_clear()
    try:
        assert analysis.load_actuals_hourly().tolist() == [150.0]
    finally:
        analysis.load_actuals_hourly.cache_clear()
