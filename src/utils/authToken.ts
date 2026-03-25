export const getStoredAuthToken = (): string => {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem('mwpanel-auth')
    return JSON.parse(raw || '{}')?.state?.token || ''
  } catch {
    return ''
  }
}
