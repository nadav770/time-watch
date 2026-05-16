import { useState, useEffect } from 'react'

const API_BASE = ''

interface Project {
  id: number
  name: string
  client_id: number
  client_name: string
  is_active: boolean
  created_at: string
}

interface Client {
  id: number
  name: string
}

interface ProjectForm {
  name: string
  client_id: number | ''
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

async function fetchProjects(clientId?: number): Promise<Project[]> {
  const url = clientId ? `/api/projects?client_id=${clientId}` : '/api/projects'
  const res = await fetch(API_BASE + url, { credentials: 'include' })
  if (!res.ok) throw new Error('שגיאה בטעינת הפרויקטים')
  return res.json()
}

async function fetchClients(activeOnly: boolean): Promise<Client[]> {
  const url = activeOnly ? '/api/clients?active=true' : '/api/clients'
  const res = await fetch(API_BASE + url, { credentials: 'include' })
  if (!res.ok) throw new Error('שגיאה בטעינת הלקוחות')
  return res.json()
}

async function createProject(form: ProjectForm): Promise<Project> {
  const res = await fetch(`${API_BASE}/api/projects`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: form.name, client_id: form.client_id }),
  })
  if (!res.ok) throw new Error('שגיאה בהוספת הפרויקט')
  return res.json()
}

async function updateProject(id: number, form: ProjectForm): Promise<Project> {
  const res = await fetch(`${API_BASE}/api/projects/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: form.name, client_id: form.client_id, is_active: form.is_active }),
  })
  if (!res.ok) throw new Error('שגיאה בעדכון הפרויקט')
  return res.json()
}

function ProjectModal({
  mode,
  project,
  onClose,
  onSaved,
}: {
  mode: 'add' | 'edit'
  project: Project | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ProjectForm>({
    name: project?.name ?? '',
    client_id: project?.client_id ?? '',
    is_active: project?.is_active ?? true,
  })
  const [activeClients, setActiveClients] = useState<Client[]>([])
  const [nameError, setNameError] = useState('')
  const [clientError, setClientError] = useState('')
  const [apiError, setApiError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchClients(true)
      .then(setActiveClients)
      .catch(() => setApiError('שגיאה בטעינת רשימת הלקוחות'))
  }, [])

  function handleChange(field: keyof ProjectForm, value: string | boolean | number) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (field === 'name') setNameError('')
    if (field === 'client_id') setClientError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    let valid = true
    if (!form.name.trim()) { setNameError('שם הפרויקט הוא שדה חובה'); valid = false }
    if (form.client_id === '') { setClientError('יש לבחור לקוח'); valid = false }
    if (!valid) return
    setSaving(true)
    setApiError('')
    try {
      if (mode === 'add') await createProject(form)
      else await updateProject(project!.id, form)
      onSaved()
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'שגיאה לא ידועה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" dir="rtl" onClick={e => e.stopPropagation()}>
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="סגור">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              {mode === 'add' ? 'יצירה' : 'עריכה'}
            </span>
            <h2 className="text-base font-semibold text-gray-800">
              {mode === 'add' ? 'יצירת פרויקט' : 'עריכת פרויקט'}
            </h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-400 text-right">
            {mode === 'add' ? 'כאן תיצור את הפרויקט החדש שיתווסף למערכת' : 'ערוך את פרטי הפרויקט'}
          </p>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">שם הפרויקט</label>
            <input
              type="text"
              value={form.name}
              onChange={e => handleChange('name', e.target.value)}
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${nameError ? 'border-red-400' : 'border-gray-200'}`}
              placeholder="שם הפרויקט"
            />
            {nameError && <p className="mt-1 text-xs text-red-500 text-right">{nameError}</p>}
          </div>

          {/* Client dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">שיוך ללקוח קיים</label>
            <select
              value={form.client_id}
              onChange={e => handleChange('client_id', e.target.value === '' ? '' : Number(e.target.value))}
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${clientError ? 'border-red-400' : 'border-gray-200'}`}
            >
              <option value="">בחר לקוח</option>
              {activeClients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {clientError && <p className="mt-1 text-xs text-red-500 text-right">{clientError}</p>}
          </div>

          {/* Active toggle — edit only */}
          {mode === 'edit' && (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleChange('is_active', !form.is_active)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${form.is_active ? 'bg-blue-600' : 'bg-gray-300'}`}
                role="switch"
                aria-checked={form.is_active}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm font-medium text-gray-700">סטטוס פעיל</span>
            </div>
          )}

          {apiError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 text-right">{apiError}</p>}

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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [allClients, setAllClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<number | ''>('')
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

  async function loadProjects(clientId?: number) {
    setLoading(true)
    setFetchError('')
    try {
      const data = await fetchProjects(clientId)
      setProjects(data)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'שגיאה בטעינת הפרויקטים')
    } finally {
      setLoading(false)
    }
  }

  async function loadAllClients() {
    try {
      const data = await fetchClients(false)
      setAllClients(data)
    } catch { /* non-critical */ }
  }

  useEffect(() => { loadAllClients(); loadProjects() }, [])

  function handleClientFilter(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value === '' ? '' : Number(e.target.value)
    setSelectedClientId(val)
    loadProjects(val === '' ? undefined : val)
  }

  function openAdd() { setSelectedProject(null); setModalMode('add') }
  function openEdit(p: Project) { setSelectedProject(p); setModalMode('edit') }
  function closeModal() { setModalMode(null); setSelectedProject(null) }
  function handleSaved() { closeModal(); loadProjects(selectedClientId === '' ? undefined : selectedClientId) }

  return (
    <div dir="rtl" className="min-h-screen bg-[#F2F2F7] p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
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
          <h1 className="text-xl font-bold text-gray-900">פרויקטים</h1>
          <p className="text-xs text-gray-400 mt-0.5">ניהול פרויקטים לפי לקוח</p>
        </div>
      </div>

      {/* Client filter */}
      <div className="flex items-center gap-3 mb-5 justify-end">
        <select
          value={selectedClientId}
          onChange={handleClientFilter}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        >
          <option value="">כל הלקוחות</option>
          {allClients.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500">סנן לפי לקוח:</span>
      </div>

      {loading && <div className="text-center py-16 text-gray-400 text-sm">טוען...</div>}
      {!loading && fetchError && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 text-right">{fetchError}</div>}

      {!loading && !fetchError && (
        <div className="rounded-2xl overflow-hidden shadow-sm">
          {projects.length === 0 ? (
            <div className="bg-white py-16 text-center text-sm text-gray-400 rounded-2xl">אין פרויקטים להצגה</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1C1C1E] text-white text-right">
                  <th className="px-5 py-4 font-medium text-xs tracking-wide">שם פרויקט</th>
                  <th className="px-5 py-4 font-medium text-xs tracking-wide">שם לקוח</th>
                  <th className="px-5 py-4 font-medium text-xs tracking-wide">סטטוס</th>
                  <th className="px-5 py-4 font-medium text-xs tracking-wide">עריכה</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project, idx) => (
                  <tr
                    key={project.id}
                    className={`border-b border-gray-100 last:border-0 transition-colors hover:bg-blue-50/30 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}`}
                  >
                    <td className="px-5 py-3.5 font-medium text-gray-800">{project.name}</td>
                    <td className="px-5 py-3.5 text-gray-500">{project.client_name}</td>
                    <td className="px-5 py-3.5">
                      {project.is_active ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">פעיל</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">לא פעיל</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => openEdit(project)}
                        className="rounded-lg p-1.5 text-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        aria-label={`ערוך את ${project.name}`}
                      >
                        <IconPencil />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {modalMode && (
        <ProjectModal mode={modalMode} project={selectedProject} onClose={closeModal} onSaved={handleSaved} />
      )}
    </div>
  )
}
