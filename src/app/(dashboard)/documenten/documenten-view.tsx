'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { showToast } from '@/components/ui/toast'
import { formatDateShort } from '@/lib/utils'
import { Upload, Inbox, Trash2, Download } from 'lucide-react'
import { uploadDocument, getDocumentDownloadUrl, verwijderDocument } from './actions'
import { UPLOAD_ACCEPT, valideerUploadBestand } from './upload-limieten'

interface Document {
  id: string
  naam: string
  bestandsnaam: string
  bestandstype: string | null
  bestandsgrootte: number | null
  storage_path: string
  created_at: string
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const columns: ColumnDef<Document, unknown>[] = [
  { accessorKey: 'naam', header: 'Naam' },
  { accessorKey: 'bestandsnaam', header: 'Bestand' },
  { accessorKey: 'bestandstype', header: 'Type' },
  { accessorKey: 'bestandsgrootte', header: 'Grootte', cell: ({ getValue }) => formatSize(getValue() as number | null) },
  { accessorKey: 'created_at', header: 'Geüpload', cell: ({ getValue }) => formatDateShort(getValue() as string) },
]

export function DocumentenView({ documenten }: { documenten: Document[] }) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // De bucket 'documenten' is privé zonder storage-policies: uploads en
  // downloads moeten via de server-actions in ./actions.ts lopen — een
  // rechtstreekse client-side storage-call wordt door RLS geweigerd.
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset de input zodat hetzelfde bestand na een fout direct opnieuw kan.
    e.target.value = ''
    if (!file) return

    // Snelle client-side check; de server-action valideert nogmaals.
    const validatiefout = valideerUploadBestand(file)
    if (validatiefout) {
      showToast(validatiefout, 'error')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('bestand', file)
      const res = await uploadDocument(formData)
      if (res.error) {
        showToast(res.error, 'error')
        return
      }
      showToast('Document geüpload', 'success')
      router.refresh()
    } catch (err) {
      showToast('Upload mislukt: ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setUploading(false)
    }
  }

  async function handleDownload(doc: Document) {
    setBusyId(doc.id)
    try {
      const res = await getDocumentDownloadUrl(doc.id)
      if (res.error || !res.url) {
        showToast(res.error || 'Download mislukt', 'error')
        return
      }
      // Signed URL met download-header: browser bewaart de originele naam.
      window.location.assign(res.url)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(doc: Document) {
    if (!confirm(`"${doc.naam}" verwijderen?`)) return
    setBusyId(doc.id)
    try {
      const res = await verwijderDocument(doc.id)
      if (res.error) {
        showToast(res.error, 'error')
        return
      }
      showToast('Document verwijderd', 'success')
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Documenten inbox"
        description="Upload en beheer uw documenten"
        actions={
          <label className="cursor-pointer">
            <span className="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors bg-primary text-white hover:bg-primary-hover px-4 py-2 text-sm">
              <Upload className="h-4 w-4" aria-hidden="true" />
              {uploading ? 'Uploaden...' : 'Document uploaden'}
            </span>
            <input
              type="file"
              className="hidden"
              accept={UPLOAD_ACCEPT}
              onChange={handleUpload}
              disabled={uploading}
              aria-label="Document uploaden"
            />
          </label>
        }
      />

      {documenten.length === 0 ? (
        <EmptyState icon={Inbox} title="Geen documenten" description="Upload uw eerste document." />
      ) : (
        <DataTable
          columns={[
            ...columns,
            {
              id: 'actions',
              header: '',
              cell: ({ row }) => (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDownload(row.original)}
                    disabled={busyId === row.original.id}
                    className="text-gray-400 hover:text-blue-500 disabled:opacity-50"
                    aria-label={`Download ${row.original.naam}`}
                    title="Downloaden"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => handleDelete(row.original)}
                    disabled={busyId === row.original.id}
                    className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                    aria-label={`Verwijder ${row.original.naam}`}
                    title="Verwijderen"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ),
            },
          ]}
          data={documenten}
          searchPlaceholder="Zoek document..."
        />
      )}
    </div>
  )
}
