import { useState } from 'react'
import type { Entry } from './EntryList'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

interface Props {
  entry: Entry
  onClose: () => void
  onSaved: (updated: Entry) => void
}

const LOCATIONS = ['משרד', 'לקוח', 'בית']

export default function EditEntryModal({ entry, onClose, onSaved }: Props) {
  const [location, setLocation] = useState(entry.location)
  const [startTime, setStartTime] = useState(entry.start_time.slice(0, 5))
  const [endTime, setEndTime] = useState(entry.end_time.slice(0, 5))
  const [description, setDescription] = useState(entry.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (endTime <= startTime) {
      setError('שעת סיום חייבת להיות אחרי שעת התחלה')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/reports/${entry.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, start_time: startTime, end_time: endTime, description }),
      })
      if (!res.ok) throw new Error('שגיאה בשמירה')
      const updated = await res.json()
      onSaved({ ...entry, ...updated })
      onClose()
    } catch {
      setError('לא ניתן לשמור. נסה שוב.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      dir="rtl"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl px-5 pt-5 pb-8 shadow-xl">
        {/* Handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-800">עריכת דיווח</h2>
          <button onClick={onClose} className="text-gray-400 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Breadcrumb */}
        <p className="text-xs text-gray-400 mb-4">
          {entry.client_name} › {entry.project_name} › {entry.task_name}
        </p>

        <div className="space-y-4">
          {/* Time */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">שעת התחלה</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">שעת סיום</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">מיקום</label>
            <div className="flex gap-2">
              {LOCATIONS.map((loc) => (
                <button
                  key={loc}
                  onClick={() => setLocation(loc)}
                  className={[
                    'flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all',
                    location === loc
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-600 border-gray-200',
                  ].join(' ')}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">תיאור</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="תיאור אופציונלי..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-500 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-60 transition-opacity"
          >
            {saving ? 'שומר...' : 'שמור שינויים'}
          </button>
        </div>
      </div>
    </div>
  )
}
