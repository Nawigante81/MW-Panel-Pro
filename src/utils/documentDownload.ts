import { getStoredAuthToken } from './authToken'

export const buildDocumentDownloadUrl = (documentId: string): string => {
  const base = `/api/documents/${encodeURIComponent(documentId)}/download`
  const token = getStoredAuthToken()
  if (!token) return base
  return `${base}?accessToken=${encodeURIComponent(token)}`
}
