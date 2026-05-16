import { useState, useEffect } from 'react'

const API_BASE = ''

interface Task {
  id: number
  name: string
  project_id: number
  project_name: string
  client_name: string
  status: 'open' | 'closed'
  created_at: string
}

interface Project {
  id: number
  name: string
  client_name: string
}

interface TaskForm {
  name: string
  project_id: number | ''
  status: 'open' | 'closed'
}

type ModalMode = 'add' | 'edit' | null

function IconPencil() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 16H9v-3z" />
    </svg>
  )
}

async function fetchTasks(projectId?: number, status?: string): Promise<Task[]> {
  const params = new URLSearchParams()
  if (projectId) params.set('project_id', String(projectId))
  if (status) params.set('status', status)
  const url = `/api/tasks${params.toString() ? `?${params}` : ''}`
  const res = await fetch(API_BASE + url, { credentials: 'include' })
  if (!res.ok) throw new Error('שגיאה בטעינת המשימות')
  return res.json()
}

async function fetchProjects(activeOnly: boolean): Promise<Project[]> {
  const url = activeOnly ? '/api/projects?active=true' : '/api/projects'
  const res = await fetch(API_BASE + url, { credentials: 'include' })
  if (!res.ok) throw new Error('שגיאה בטעינת הפרויקטים')
  return res.json()
}

async function createTask(form: TaskForm): Promise<Task> {
  const res = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: form.name, project_id: form.project_id }),
  })
  if (!res.ok) throw new Error('שגיאה בהוספת המשימה')
  return res.json()
}

async function updateTask(id: number, form: TaskForm): Promise<Task> {
  const res = await fetch(`${API_BASE}/api/tasks/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: form.name, status: form.status }),
  })
  if (!res.ok) throw new Error('שגיאה בעדכון המשימה')
  return res.json()
}

function TaskModal({
  mode,
  task,
  onClose,
  onSaved,
}: {
  mode: 'add' | 'edit'
  task: Task | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<TaskForm>({
    name: task?.name ?? '',
    project_id: task?.project_id ?? '',
    status: task?.status ?? 'open',
  })
  const [activeProjects, setActiveProjects] = useState<Project[]>([])
  const [nameError, setNameError] = useState('')
  const [projectError, setProjectError] = useState('')
  const [apiError, setApiError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchProjects(true)
      .then(setActiveProjects)
      .catch(() => setApiError('שגיאה בטעינת רשימת הפרויקטים'))
  }, [])

  function handleChange(field: keyof TaskForm, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (field === 'name') setNameError('')
    if (field === 'project_id') setProjectError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    let valid = true
    if (!form.name.trim()) { setNameError('שם המשימה הוא שדה חובה'); valid = false }
    if (form.project_id === '') { setProjectError('יש לבחור פרויקט'); valid = false }
    if (!valid) return
    setSaving(true)
    setApiError('')
    try {
      if (mode === 'add') await createTask(form)
      else await updateTask(task!.id, form)
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
              {mode === 'add' ? 'יצירת משימה' : 'עריכת משימה'}
            </h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-400 text-right">
            {mode === 'add' ? 'כאן תיצור את המשימה החדשה שתתווסף למערכת' : 'ערוך את פרטי המשימה'}
          </p>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">שם המשימה</label>
            <input
              type="text"
              value={form.name}
              onChange={e => handleChange('name', e.target.value)}
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${nameError ? 'border-red-400' : 'border-gray-200'}`}
              placeholder="שם המשימה"
            />
            {nameError && <p className="mt-1 text-xs text-red-500 text-right">{nameError}</p>}
          </div>

          {/* Project dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">שיוך לפרויקט קיים</label>
            <select
              value={form.project_id}
              onChange={e => handleChange('project_id', e.target.value === '' ? '' : Number(e.target.value))}
              disabled={mode === 'edit'}
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${projectError ? 'border-red-400' : 'border-gray-200'} ${mode === 'edit' ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <option value="">בחר פרויקט</option>
              {activeProjects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {projectError && <p className="mt-1 text-xs text-red-500 text-right">{projectError}</p>}
          </div>

          {/* Status pill buttons — edit only */}
          {mode === 'edit' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-right">סטטוס</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleChange('status', 'open')}
                  className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${form.status === 'open' ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  פתוח
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('status', 'closed')}
                  className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${form.status === 'closed' ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  סגור
                </button>
              </div>
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

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  async function loadTasks(projectId?: number, status?: string) {
    setLoading(true)
    setFetchError('')
    try {
      const data = await fetchTasks(projectId, status)
      setTasks(data)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'שגיאה בטעינת המשימות')
    } finally {
      setLoading(false)
    }
  }

  async function loadAllProjects() {
    try {
      const data = await fetchProjects(false)
      setAllProjects(data)
    } catch { /* non-critical */ }
  }

  useEffect(() => { loadAllProjects(); loadTasks() }, [])

  function handleProjectFilter(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value === '' ? '' : Number(e.target.value)
    setSelectedProjectId(val)
    loadTasks(val === '' ? undefined : val, selectedStatus || undefined)
  }

  function handleStatusFilter(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    setSelectedStatus(val)
    loadTasks(selectedProjectId === '' ? undefined : selectedProjectId, val || undefined)
  }

  function openAdd() { setSelectedTask(null); setModalMode('add') }
  function openEdit(task: Task) { setSelectedTask(task); setModalMode('edit') }
  function closeModal() { setModalMode(null); setSelectedTask(null) }
  function handleSaved() {
    closeModal()
    loadTasks(selectedProjectId === '' ? undefined : selectedProjectId, selectedStatus || undefined)
  }

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
          <h1 className="text-xl font-bold text-gray-900">משימות</h1>
          <p className="text-xs text-gray-400 mt-0.5">ניהול משימות לפי פרויקט</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 justify-end flex-wrap">
        <select
          value={selectedStatus}
          onChange={handleStatusFilter}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        >
          <option value="">כל הסטטוסים</option>
          <option value="open">פתוח</option>
          <option value="closed">סגור</option>
        </select>
        <select
          value={selectedProjectId}
          onChange={handleProjectFilter}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        >
          <option value="">כל הפרויקטים</option>
          {allProjects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500">סנן:</span>
      </div>

      {loading && <div className="text-center py-16 text-gray-400 text-sm">טוען...</div>}
      {!loading && fetchError && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 text-right">{fetchError}</div>}

      {!loading && !fetchError && (
        <div className="rounded-2xl overflow-hidden shadow-sm">
          {tasks.length === 0 ? (
            <div className="bg-white py-16 text-center text-sm text-gray-400 rounded-2xl">אין משימות להצגה</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1C1C1E] text-white text-right">
                  <th className="px-5 py-4 font-medium text-xs tracking-wide">שם משימה</th>
                  <th className="px-5 py-4 font-medium text-xs tracking-wide">שם פרויקט</th>
                  <th className="px-5 py-4 font-medium text-xs tracking-wide">שם לקוח</th>
                  <th className="px-5 py-4 font-medium text-xs tracking-wide">סטטוס</th>
                  <th className="px-5 py-4 font-medium text-xs tracking-wide">עריכה</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, idx) => (
                  <tr
                    key={task.id}
                    className={`border-b border-gray-100 last:border-0 transition-colors hover:bg-blue-50/30 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}`}
                  >
                    <td className="px-5 py-3.5 font-medium text-gray-800">{task.name}</td>
                    <td className="px-5 py-3.5 text-gray-500">{task.project_name}</td>
                    <td className="px-5 py-3.5 text-gray-500">{task.client_name}</td>
                    <td className="px-5 py-3.5">
                      {task.status === 'open' ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">פתוח</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">סגור</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => openEdit(task)}
                        className="rounded-lg p-1.5 text-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        aria-label={`ערוך את ${task.name}`}
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
        <TaskModal mode={modalMode} task={selectedTask} onClose={closeModal} onSaved={handleSaved} />
      )}
    </div>
  )
}
