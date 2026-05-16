import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../api/client'

const PASSWORD_RULES = [
  { test: p => p.length >= 8,            label: 'לפחות 8 תווים' },
  { test: p => /[A-Z]/.test(p),          label: 'אות גדולה אחת לפחות' },
  { test: p => /[a-z]/.test(p),          label: 'אות קטנה אחת לפחות' },
  { test: p => /\d/.test(p),             label: 'ספרה אחת לפחות' },
  { test: p => /[^A-Za-z0-9]/.test(p),  label: 'תו מיוחד אחד לפחות' },
]

// Full-page forced password change — shown on first login when must_change_password is true
export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { patchUser } = useAuth()

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const newPwRules = PASSWORD_RULES.map(r => ({ ...r, met: r.test(newPw) }))
  const newPwValid = newPw.length > 0 && newPwRules.every(r => r.met)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!currentPw) { setError('יש להזין את הסיסמה הנוכחית'); return }
    if (!newPwValid) { setError('הסיסמה החדשה אינה עומדת בדרישות'); return }
    if (newPw === currentPw) { setError('הסיסמה החדשה חייבת להיות שונה מהסיסמה הנוכחית'); return }

    setSaving(true)
    setError('')
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      })
      patchUser({ must_change_password: false })
      navigate('/monthly', { replace: true })
    } catch (err) {
      if (err?.status === 401) setError('הסיסמה הנוכחית שגויה')
      else if (err?.status === 423) setError('החשבון נעול זמנית. נסה שוב מאוחר יותר.')
      else if (err?.message) setError(err.message)
      else setError('אירעה שגיאה. נסה שוב.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-100 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-800">שינוי סיסמה</h1>
            <p className="text-sm text-gray-500 mt-1">
              לפני שתמשיך, עליך להגדיר סיסמה אישית
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="px-6 py-5 space-y-5">

            {error && (
              <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 text-center">
                {error}
              </p>
            )}

            {/* Current password */}
            <div className="space-y-1">
              <label htmlFor="current-pw" className="block text-sm font-semibold text-gray-700">
                סיסמה נוכחית
              </label>
              <input
                id="current-pw"
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                autoComplete="current-password"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>

            {/* New password */}
            <div className="space-y-1">
              <label htmlFor="new-pw" className="block text-sm font-semibold text-gray-700">
                סיסמה חדשה
              </label>
              <input
                id="new-pw"
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                autoComplete="new-password"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />

              {/* Inline requirements checklist */}
              {newPw.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {newPwRules.map(r => (
                    <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.met ? 'text-green-600' : 'text-gray-400'}`}>
                      <span className="text-[10px]">{r.met ? '✓' : '○'}</span>
                      {r.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl min-h-[44px] disabled:opacity-50 hover:bg-blue-700 transition-colors"
            >
              {saving ? 'שומר...' : 'שמור סיסמה'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
