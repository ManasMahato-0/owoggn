// Types mirror backend/app/schemas.py one-to-one.

export interface Metrics {
  n: number
  mae?: number
  rmse?: number
  bias?: number
  nmae_pct?: number
  mean_actual?: number
  p10?: number
  p50?: number
  p90?: number
  p95?: number
  max_over?: number
  max_under?: number
}

export interface Meta {
  first_delivery_day: string
  last_delivery_day: string
  default_cutoff: string
  max_horizon_h: number
  publish_times_per_day: string[]
}

export interface HourRow {
  start_time: string
  publish_time: string
  horizon_h: number
  forecast: number
  actual: number | null
  error: number | null
  band_low: number
  band_high: number
}

export interface DayResponse {
  date: string
  cutoff: string
  latest_publish: string | null
  rows: HourRow[]
  metrics: Metrics
  buffer_p90_mw: number | null
  month_bias_mw: number | null
}

export interface HourOfDayMetrics extends Metrics {
  hour: number
}

export interface HorizonMetrics extends Metrics {
  horizon_h: number
}

export interface HistogramBin {
  bin_start: number
  bin_end: number
  count: number
}

export interface AccuracyResponse {
  cutoff: string
  metrics: Metrics
  by_hour: HourOfDayMetrics[]
  histogram: HistogramBin[]
}

async function getJSON<T>(path: string, params?: Record<string, string>): Promise<T> {
  const qs = params ? `?${new URLSearchParams(params)}` : ''
  const res = await fetch(`/api${path}${qs}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(typeof body.detail === 'string' ? body.detail : `Request failed (${res.status})`)
  }
  return res.json()
}

export const api = {
  meta: () => getJSON<Meta>('/meta'),
  day: (date: string, cutoff: string) => getJSON<DayResponse>('/day', { date, cutoff }),
  accuracy: (cutoff: string) => getJSON<AccuracyResponse>('/accuracy', { cutoff }),
  horizon: () => getJSON<HorizonMetrics[]>('/accuracy/horizon'),
}
