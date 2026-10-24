import { useEffect, useState } from 'react'

interface State<T> {
  data: T | null
  error: string | null
  loading: boolean
}

/** Run `load` whenever `deps` change; responses from superseded calls are dropped. */
export function useFetch<T>(load: () => Promise<T>, deps: unknown[]): State<T> {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true })

  useEffect(() => {
    let current = true
    setState((s) => ({ ...s, loading: true, error: null }))
    load()
      .then((data) => current && setState({ data, error: null, loading: false }))
      .catch((e: Error) => current && setState({ data: null, error: e.message, loading: false }))
    return () => {
      current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
