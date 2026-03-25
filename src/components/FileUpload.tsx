import { useState, useRef, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Upload, File, FileText, Image, X, Download, Eye, Search, Filter, Folder, CheckCircle, Trash2 } from 'lucide-react'
import { apiFetch } from '../utils/apiClient'
import { useDataStore } from '../store/dataStore'
import { useAuthStore } from '../store/authStore'

type FileAsset = {
  id: string
  agencyId: string
  name: string
  mimeType: string
  sizeBytes: number
  category: 'document' | 'photo' | 'contract' | 'other' | string
  entity?: string
  entityType?: string
  uploadedBy?: string
  downloadUrl: string
  previewUrl: string
  createdAt: string
}

const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return Image
  if (mimeType.includes('pdf')) return FileText
  return File
}

const getTypeFromMime = (mimeType: string): 'image' | 'pdf' | 'doc' | 'other' => {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.includes('pdf')) return 'pdf'
  if (mimeType.includes('word') || mimeType.includes('officedocument')) return 'doc'
  return 'other'
}

const getFileColor = (mimeType: string) => {
  const type = getTypeFromMime(mimeType)
  if (type === 'image') return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30'
  if (type === 'pdf') return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30'
  return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30'
}

const getCategoryColor = (cat: string) => {
  if (cat === 'contract') return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
  if (cat === 'photo') return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
  if (cat === 'document') return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
  return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
}

const getCategoryLabel = (cat: string) => {
  const map: Record<string, string> = { contract: 'Umowa', photo: 'Zdjęcie', document: 'Dokument', other: 'Inne' }
  return map[cat] || cat
}

const formatEntityContext = (file: FileAsset) => {
  const type = (file.entityType || '').toLowerCase()
  if (type.includes('client') || type.includes('klient')) return `Klient: ${file.entity || '-'}`
  if (type.includes('property') || type.includes('nieruch')) return `Nieruchomość: ${file.entity || '-'}`
  if (type.includes('document') || type.includes('dokument')) return `Dokument: ${file.entity || '-'}`
  if (type.includes('offer') || type.includes('listing') || type.includes('oferta')) return `Oferta: ${file.entity || '-'}`
  return `${file.entityType || 'Kontekst'}: ${file.entity || 'Nieprzypisany'}`
}

const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem('mwpanel-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.token || null
  } catch {
    return null
  }
}

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => {
    const val = typeof reader.result === 'string' ? reader.result : ''
    const base64 = val.includes(',') ? val.split(',')[1] : val
    resolve(base64)
  }
  reader.onerror = reject
  reader.readAsDataURL(file)
})

export default function FileUpload() {
  const { getAgencyId } = useDataStore()
  const currentUserEmail = useAuthStore((s) => s.user?.email || 'unknown@user')

  const [files, setFiles] = useState<FileAsset[]>([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFiles = async () => {
    try {
      setError('')
      const agencyId = getAgencyId()
      const params = new URLSearchParams({ agencyId })
      if (search.trim()) params.set('search', search.trim())
      if (filterType !== 'all') params.set('type', filterType)
      if (filterCategory !== 'all') params.set('category', filterCategory)
      const rows = await apiFetch<FileAsset[]>(`/file-assets?${params.toString()}`)
      setFiles(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać plików')
    }
  }

  useEffect(() => {
    void loadFiles()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      void loadFiles()
    }, 250)
    return () => clearTimeout(t)
  }, [search, filterType, filterCategory])

  const filtered = useMemo(() => files, [files])

  const totalSize = files.reduce((sum, f) => sum + f.sizeBytes, 0)
  const photos = files.filter(f => getTypeFromMime(f.mimeType) === 'image').length
  const pdfs = files.filter(f => getTypeFromMime(f.mimeType) === 'pdf').length

  const uploadFile = async (file: File) => {
    try {
      setError('')
      setInfo('')
      setUploading(true)
      setUploadProgress(5)
      const base64 = await toBase64(file)
      setUploadProgress(35)

      const category = file.type.startsWith('image/') ? 'photo' : file.type.includes('pdf') ? 'document' : 'other'

      await apiFetch<FileAsset>('/file-assets/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyId: getAgencyId(),
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          base64,
          category,
          entity: 'Nieprzypisany',
          entityType: '-',
          uploadedBy: currentUserEmail,
        }),
      })

      setUploadProgress(100)
      setUploadedFile(file.name)
      setInfo(`Plik ${file.name} został zapisany.`)
      setTimeout(() => setUploadedFile(null), 3000)
      await loadFiles()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload nie powiódł się')
    } finally {
      setUploading(false)
      setTimeout(() => setUploadProgress(0), 400)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length > 0) {
      void uploadFile(droppedFiles[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    void uploadFile(selected)
  }

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Usunąć plik?')
    if (!confirmed) return
    try {
      await apiFetch(`/file-assets/${encodeURIComponent(id)}`, { method: 'DELETE' })
      setInfo('Plik usunięty.')
      await loadFiles()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się usunąć pliku')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Pliki i załączniki</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Upload i zarządzanie plikami powiązanymi z klientami i nieruchomościami</p>
      </div>

      <div className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="font-medium text-gray-900 dark:text-white">Kontekst CRM dla załączników</p>
          <p className="text-xs text-gray-500 mt-1">Łącz pliki z dokumentami i rekordami CRM, aby łatwo odtworzyć historię sprawy.</p>
        </div>
        <Link to="/dokumenty" className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
          Przejdź do Document Hub
        </Link>
      </div>

      {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
      {info && <div className="text-sm text-emerald-600 dark:text-emerald-400">{info}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Wszystkie pliki', value: files.length, icon: Folder, color: 'blue' },
          { label: 'Zdjęcia', value: photos, icon: Image, color: 'green' },
          { label: 'Dokumenty PDF', value: pdfs, icon: FileText, color: 'red' },
          { label: 'Łączny rozmiar', value: formatSize(totalSize), icon: File, color: 'purple' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                s.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30' :
                s.color === 'green' ? 'bg-green-100 dark:bg-green-900/30' :
                s.color === 'red' ? 'bg-red-100 dark:bg-red-900/30' :
                'bg-purple-100 dark:bg-purple-900/30'
              }`}>
                <s.icon size={18} className={
                  s.color === 'blue' ? 'text-blue-600 dark:text-blue-400' :
                  s.color === 'green' ? 'text-green-600 dark:text-green-400' :
                  s.color === 'red' ? 'text-red-600 dark:text-red-400' :
                  'text-purple-600 dark:text-purple-400'
                } />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-800 dark:text-white">{s.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
          dragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
        }`}
      >
        <input ref={fileInputRef} title="Wybierz plik" type="file" className="hidden" onChange={handleFileInput} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" />
        <Upload size={40} className={`mx-auto mb-3 ${dragging ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} />
        <p className="text-base font-semibold text-gray-700 dark:text-gray-300">Przeciągnij pliki tutaj lub kliknij</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">PDF, DOC, DOCX, JPG, PNG – maks. 12 MB</p>
      </div>

      {uploading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-blue-200 dark:border-blue-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Przesyłanie...</span>
            <span className="text-sm text-blue-600 dark:text-blue-400 font-bold">{uploadProgress}%</span>
          </div>
          <progress
            className="w-full h-2 rounded-full overflow-hidden appearance-none [&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-bar]:dark:bg-gray-700 [&::-webkit-progress-value]:bg-blue-600 [&::-moz-progress-bar]:bg-blue-600"
            max={100}
            value={uploadProgress}
            aria-label="Postęp przesyłania"
          />
        </div>
      )}

      {uploadedFile && (
        <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
          <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
          <p className="text-sm text-green-700 dark:text-green-300">Plik <strong>{uploadedFile}</strong> został przesłany pomyślnie</p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Szukaj pliku lub powiązanego rekordu..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            title="Filtr typu pliku"
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm"
          >
            <option value="all">Wszystkie typy</option>
            <option value="image">Zdjęcia</option>
            <option value="application/pdf">PDF</option>
            <option value="application/vnd">DOC</option>
          </select>
          <select
            title="Filtr kategorii pliku"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm"
          >
            <option value="all">Wszystkie kategorie</option>
            <option value="contract">Umowy</option>
            <option value="photo">Zdjęcia</option>
            <option value="document">Dokumenty</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <span className="font-semibold text-gray-800 dark:text-white">Lista plików</span>
            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-xs">{filtered.length}</span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <File size={40} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Brak plików dla wybranych filtrów.</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button onClick={() => { setSearch(''); setFilterType('all'); setFilterCategory('all') }} className="px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                Wyczyść filtry
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 rounded-md btn-primary text-sm">
                Dodaj plik
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filtered.map(file => {
              const Icon = getFileIcon(file.mimeType)
              return (
                <div key={file.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${getFileColor(file.mimeType)}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{file.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${getCategoryColor(file.category)}`}>
                        {getCategoryLabel(file.category)}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{formatEntityContext(file)}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">{formatSize(file.sizeBytes)}</span>
                    </div>
                  </div>
                  <div className="hidden md:block text-right shrink-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{file.uploadedBy || '-'}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{new Date(file.createdAt).toLocaleString('pl-PL')}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => {
                      const token = getStoredToken()
                      const url = token ? `${file.previewUrl}?accessToken=${encodeURIComponent(token)}` : file.previewUrl
                      window.open(url, '_blank', 'noopener,noreferrer')
                    }} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors" title="Podgląd">
                      <Eye size={14} className="text-gray-600 dark:text-gray-300" />
                    </button>
                    <button onClick={() => {
                      const token = getStoredToken()
                      const url = token ? `${file.downloadUrl}?accessToken=${encodeURIComponent(token)}` : file.downloadUrl
                      window.open(url, '_blank', 'noopener,noreferrer')
                    }} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors" title="Pobierz">
                      <Download size={14} className="text-gray-600 dark:text-gray-300" />
                    </button>
                    <button onClick={() => void handleDelete(file.id)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Usuń">
                      <Trash2 size={14} className="text-red-500" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
