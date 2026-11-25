import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '@/lib/api'

/** GET a path and keep the result. `reload()` fetches again. Pass null to skip. */
export function useApi<T>(path: string | null): { data: T | null; error: string; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) return
    let cancelled = false
    api
      .get<T>(path)
      .then((r) => {
        if (!cancelled) {
          setData(r)
          setError('')
        }
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [path, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, reload }
}
