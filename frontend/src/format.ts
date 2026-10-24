const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

export const mw = (v: number | null | undefined) => (v == null ? '–' : `${nf0.format(v)} MW`)
export const gw = (v: number | null | undefined) => (v == null ? '–' : `${nf1.format(v / 1000)} GW`)
export const signedMw = (v: number | null | undefined) =>
  v == null ? '–' : `${v > 0 ? '+' : ''}${nf0.format(v)} MW`
export const pct = (v: number | null | undefined) => (v == null ? '–' : `${nf1.format(v)}%`)

// January: UK local time == UTC, but format in Europe/London so labels stay right if scope grows.
const tf = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })
const dtf = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export const hhmm = (iso: string) => tf.format(new Date(iso))
export const dayTime = (iso: string) => dtf.format(new Date(iso))
