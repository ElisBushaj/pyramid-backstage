import { useEffect, useState } from 'react'

/**
 * Returns `value` only after it has stopped changing for `delay` ms (default
 * 300). Used to keep search/filter inputs from firing a request per keystroke
 * (XC-9) — the debounced result feeds the query key.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
