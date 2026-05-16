import { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

interface Client {
  id: number
  name: string
  contact: string | null
  is_active: boolean
  created_at: string
}

interface ClientForm {
  name: string
  contact: string
  is_active: boolean
}

type ModalMode = 'add' | 'edit' | null

function IconPencil() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 16H9v-3z" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

async function fetchClients(): Promise<Client[]> {
  const res = await fetch(`${API_BASE}/api/clients`, { credentials: 'include' })
  if (!res.ok) throw new Error('שגיאה בטעינת הלקוחות')
  return res.json()
}

async function createClient(form: ClientForm): Promise<Client> {
  const res = await fetch(`${API_BASE}/api/clients`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: form.name, contact: form.contact || undefined }),
  })
  if (!res.ok) throw new Error('שגיאה בהוספת הלקוח')
  return res.json()
}

async function updateClient(id: number, form: ClientForm): Promise<Client> {
  const res = await fetch(`${API_BASE}/api/clients/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: form.name, contact: form.contact || undefined, is_active: form.is_active }),
  })
  if (!res.ok) throw new Error('שגיאה בעדכון הלקוח')
  return res.json()
}

// Deactivates a client by setting is_active=false (soft delete)
async function deactivateClient(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/clients/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: false }),
  })
  if (!res.ok) throw new Error('שגיאה במחיקת הלקוח')
}

function ClientModal({
  mode,
  client,
  onClose,
  onSaved,
}: {
  mode: 'add' | 'edit'
  client: Client | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ClientForm>({
    name: client?.name ?? '',
    contact: client?.contact ?? '',
    is_active: client?.is_active ?? true,
  })
  const [nameError, setNameError] = useState('')
  const [apiError, setApiError] = useState('')
  const [saving, setSaving] = useState(false)

  function handleChange(field: keyof ClientForm, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (field === 'name') setNameError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setNameError('שם הלקוח הוא שדה חובה')
      return
    }
    setSaving(true)
    setApiError('')
    try {
      if (mode === 'add') {
        await createClient(form)
      } else {
        await updateClient(client!.id, form)
      }
      onSaved()
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'שגיאה לא ידועה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
        dir="rtl"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="סגור"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              {mode === 'add' ? 'יצירה' : 'עריכה'}
            </span>
            <h2 className="text-base font-semibold text-gray-800">
              {mode === 'add' ? 'יצירת לקוח' : 'עריכת לקוח'}
            </h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-400 text-right">
            {mode === 'add' ? 'כאן תיצור את הלקוח החדש שיתווסף למערכת' : 'ערוך את פרטי הלקוח'}
          </p>

          {/* Name field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
              שם הלקוח
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => handleChange('name', e.target.value)}
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                nameError ? 'border-red-400' : 'border-gray-200'
              }`}
              placeholder="שם הלקוח"
            />
            {nameError && <p className="mt-1 text-xs text-red-500 text-right">{nameError}</p>}
          </div>

          {/* Contact field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
              איש קשר
            </label>
            <input
              type="text"
              value={form.contact}
              onChange={e => handleChange('contact', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="שם איש הקשר (אופציונלי)"
            />
          </div>

          {/* Active toggle — edit only */}
          {mode === 'edit' && (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleChange('is_active', !form.is_active)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  form.is_active ? 'bg-blue-600' : 'bg-gray-300'
                }`}
                role="switch"
                aria-checked={form.is_active}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  form.is_active ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
              <span className="text-sm font-medium text-gray-700">סטטוס פעיל</span>
            </div>
          )}

          {apiError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 text-right">{apiError}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  async function loadClients() {
    setLoading(true)
    setFetchError('')
    try {
      const data = await fetchClients()
      setClients(data)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'שגיאה בטעינת הלקוחות')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadClients() }, [])

  function openAdd() {
    setSelectedClient(null)
    setModalMode('add')
  }

  function openEdit(client: Client) {
    setSelectedClient(client)
    setModalMode('edit')
  }

  function closeModal() {
    setModalMode(null)
    setSelectedClient(null)
  }

  function handleSaved() {
    closeModal()
    loadClients()
  }

  // Deactivates a client after confirmation
  async function handleDelete(client: Client) {
    if (!confirm(`האם למחוק את הלקוח "${client.name}"?`)) return
    setDeletingId(client.id)
    try {
      await deactivateClient(client.id)
      loadClients()
    } catch {
      alert('שגיאה במחיקת הלקוח')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#F2F2F7] p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          יצירה
        </button>
        <div className="text-right">
          <h1 className="text-xl font-bold text-gray-900">לקוחות</h1>
          <p className="text-xs text-gray-400 mt-0.5">ניהול לקוחות המערכת</p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-16 text-gray-400 text-sm">טוען...</div>
      )}

      {/* Error */}
      {!loading && fetchError && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 text-right">{fetchError}</div>
      )}

      {/* Table */}
      {!loading && !fetchError && (
        <div className="rounded-2xl overflow-hidden shadow-sm">
          {clients.length === 0 ? (
            <div className="bg-white py-16 text-center text-sm text-gray-400 rounded-2xl">אין לקוחות להצגה</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1C1C1E] text-white text-right">
                  <th className="px-5 py-4 font-medium text-xs tracking-wide">שם לקוח</th>
                  <th className="px-5 py-4 font-medium text-xs tracking-wide">איש קשר</th>
                  <th className="px-5 py-4 font-medium text-xs tracking-wide">סטטוס</th>
                  <th className="px-5 py-4 font-medium text-xs tracking-wide">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client, idx) => (
                  <tr
                    key={client.id}
                    className={`border-b border-gray-100 last:border-0 transition-colors hover:bg-blue-50/30 ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'
                    }`}
                  >
                    <td className="px-5 py-3.5 font-medium text-gray-800">{client.name}</td>
                    <td className="px-5 py-3.5 text-gray-500">{client.contact ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      {client.is_active ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          פעיל
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                          לא פעיל
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(client)}
                          className="rounded-lg p-1.5 text-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          aria-label={`ערוך את ${client.name}`}
                        >
                          <IconPencil />
                        </button>
                        <button
                          onClick={() => handleDelete(client)}
                          disabled={deletingId === client.id}
                          className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                          aria-label={`מחק את ${client.name}`}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal */}
      {modalMode && (
        <ClientModal
          mode={modalMode}
          client={selectedClient}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
