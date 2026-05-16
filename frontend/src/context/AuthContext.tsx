import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type User = {
  id: number
  email: string
  role: string
  full_name: string
  must_change_password?: boolean
}

type AuthContextValue = {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  patchUser: (patch: Partial<User>) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const API_BASE = ''

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Check if user already has a valid session on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))
  }, [])

  async function login(email: string, password: string) {
    let res: Response
    try {
      res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
    } catch {
      throw new Error('אירעה שגיאה. נסי שוב מאוחר יותר')
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      if (res.status === 423) throw new Error('החשבון ננעל עקב ניסיונות התחברות מרובים')
      if (res.status === 401) throw new Error(body?.error ?? 'האימייל או הסיסמה שגויים')
      throw new Error(body?.error ?? 'התחברות נכשלה')
    }
    const data = await res.json()
    setUser(data)
  }

  async function logout() {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' })
    } catch {
      // ignore network errors — user state is cleared locally regardless
    }
    setUser(null)
  }

  // Merge a partial update into the current user without re-fetching /api/auth/me
  function patchUser(patch: Partial<User>) {
    setUser(prev => (prev ? { ...prev, ...patch } : null))
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, patchUser }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
