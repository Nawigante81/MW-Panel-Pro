type JsonValue = Record<string, any>

const STORAGE_KEY = 'mwpanel-view-prefs-v1'

const readStore = (): JsonValue => {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

const writeStore = (value: JsonValue) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

const roleKey = (role: string | undefined, key: string) => `${role || 'agent'}:${key}`

export const getRoleScopedPreference = <T>(role: string | undefined, key: string, fallback: T): T => {
  const store = readStore()
  const stored = store[roleKey(role, key)]
  return (stored === undefined ? fallback : stored) as T
}

export const setRoleScopedPreference = <T>(role: string | undefined, key: string, value: T) => {
  const store = readStore()
  store[roleKey(role, key)] = value
  writeStore(store)
}
