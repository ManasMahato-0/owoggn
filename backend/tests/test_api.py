from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_day_returns_24_hours():
    r = client.get("/api/day", params={"date": "2026-01-15", "cutoff": "09:00"})
    assert r.status_code == 200
    body = r.json()
    assert len(body["rows"]) == 24
    assert all(row["publish_time"] <= body["cutoff"] for row in body["rows"])
    assert all(row["band_low"] <= row["band_high"] for row in body["rows"])


def test_day_outside_scope_is_404():
    assert client.get("/api/day", params={"date": "2026-03-01"}).status_code == 404


def test_bad_cutoff_is_422():
    assert client.get("/api/day", params={"date": "2026-01-15", "cutoff": "9am"}).status_code == 422


def test_horizon_curve_covers_0_to_48h():
    hs = [r["horizon_h"] for r in client.get("/api/accuracy/horizon").json()]
    assert hs == list(range(49))
