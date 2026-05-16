/**
 * Integration tests for App routing guards.
 * Each test verifies that the correct guard (ProtectedRoute / AdminRoute)
 * redirects to the right destination for the given auth state and path.
 *
 * Strategy: render a lightweight AppShell with MemoryRouter + real AuthProvider
 * + mocked global fetch (AuthContext calls fetch directly), mirroring the
 * route structure in App.tsx.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuthProvider } from './context/AuthContext'
import LoginPage from './features/auth/LoginPage'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'

// AuthContext uses fetch() directly — mock it globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Lightweight stubs so tests don't load full page trees
const DailyStub  = () => <div>daily-page</div>
const UsersStub  = () => <div>users-page</div>
const AdminStub  = () => <div>admin-layout<Outlet /></div>

function makeResponse(ok, data) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(data),
  })
}

// Mirrors the real App.tsx route structure (without Layout chrome)
function AppShell({ initialEntries = ['/'] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/"      element={<Navigate to="/daily" replace />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/daily"    element={<DailyStub />} />
            <Route path="/monthly"  element={<div>monthly-page</div>} />
            <Route path="/absences" element={<div>absences-page</div>} />

            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminStub />}>
                <Route index element={<Navigate to="users" replace />} />
                <Route path="users" element={<UsersStub />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

beforeEach(() => vi.clearAllMocks())

// ─── /login (public) ───────────────────────────────────────────────────────

describe('/login route', () => {
  it('renders the login form when the user is not authenticated', async () => {
    mockFetch.mockReturnValue(makeResponse(false, null))
    render(<AppShell initialEntries={['/login']} />)
    expect(await screen.findByRole('button', { name: /כניסה/i })).toBeInTheDocument()
  })

  it('redirects an already-authenticated user away from /login to /daily', async () => {
    mockFetch.mockReturnValue(makeResponse(true, { id: 1, role: 'employee' }))
    render(<AppShell initialEntries={['/login']} />)
    await waitFor(() => expect(screen.getByText('daily-page')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /כניסה/i })).not.toBeInTheDocument()
  })
})

// ─── ProtectedRoute (unauthenticated → /login) ────────────────────────────

describe('ProtectedRoute — unauthenticated users', () => {
  it('redirects to /login when visiting /daily without a session', async () => {
    mockFetch.mockReturnValue(makeResponse(false, null))
    render(<AppShell initialEntries={['/daily']} />)
    expect(await screen.findByRole('button', { name: /כניסה/i })).toBeInTheDocument()
    expect(screen.queryByText('daily-page')).not.toBeInTheDocument()
  })

  it('redirects to /login when visiting /monthly without a session', async () => {
    mockFetch.mockReturnValue(makeResponse(false, null))
    render(<AppShell initialEntries={['/monthly']} />)
    expect(await screen.findByRole('button', { name: /כניסה/i })).toBeInTheDocument()
  })

  it('redirects to /login when visiting /admin/users without a session', async () => {
    mockFetch.mockReturnValue(makeResponse(false, null))
    render(<AppShell initialEntries={['/admin/users']} />)
    expect(await screen.findByRole('button', { name: /כניסה/i })).toBeInTheDocument()
    expect(screen.queryByText('users-page')).not.toBeInTheDocument()
  })

  it('shows a loading spinner while the session check is in flight', () => {
    mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
    render(<AppShell initialEntries={['/daily']} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('daily-page')).not.toBeInTheDocument()
  })
})

// ─── ProtectedRoute — authenticated employees ────────────────────────────

describe('ProtectedRoute — authenticated employees', () => {
  it('renders /daily for an authenticated employee', async () => {
    mockFetch.mockReturnValue(makeResponse(true, { id: 1, role: 'employee' }))
    render(<AppShell initialEntries={['/daily']} />)
    expect(await screen.findByText('daily-page')).toBeInTheDocument()
  })

  it('does not redirect an employee away from /daily to /login', async () => {
    mockFetch.mockReturnValue(makeResponse(true, { id: 1, role: 'employee' }))
    render(<AppShell initialEntries={['/daily']} />)
    await screen.findByText('daily-page')
    expect(screen.queryByRole('button', { name: /כניסה/i })).not.toBeInTheDocument()
  })
})

// ─── AdminRoute — role guard ──────────────────────────────────────────────

describe('AdminRoute — role guard', () => {
  it('renders /admin/users for an authenticated admin', async () => {
    mockFetch.mockReturnValue(makeResponse(true, { id: 1, role: 'admin' }))
    render(<AppShell initialEntries={['/admin/users']} />)
    expect(await screen.findByText('users-page')).toBeInTheDocument()
  })

  it('does NOT render /admin/users for an authenticated employee', async () => {
    mockFetch.mockReturnValue(makeResponse(true, { id: 2, role: 'employee' }))
    render(<AppShell initialEntries={['/admin/users']} />)
    await waitFor(() =>
      expect(screen.queryByText('users-page')).not.toBeInTheDocument()
    )
  })

  it('sends an employee who visits /admin/users to the daily page', async () => {
    mockFetch.mockReturnValue(makeResponse(true, { id: 2, role: 'employee' }))
    render(<AppShell initialEntries={['/admin/users']} />)
    expect(await screen.findByText('daily-page')).toBeInTheDocument()
  })

  it('redirects an unauthenticated request for /admin/users to /login (not daily)', async () => {
    mockFetch.mockReturnValue(makeResponse(false, null))
    render(<AppShell initialEntries={['/admin/users']} />)
    expect(await screen.findByRole('button', { name: /כניסה/i })).toBeInTheDocument()
    expect(screen.queryByText('daily-page')).not.toBeInTheDocument()
    expect(screen.queryByText('users-page')).not.toBeInTheDocument()
  })
})

// ─── Catch-all ────────────────────────────────────────────────────────────

describe('catch-all route', () => {
  it('redirects unknown paths to /login when unauthenticated', async () => {
    mockFetch.mockReturnValue(makeResponse(false, null))
    render(<AppShell initialEntries={['/some/unknown/path']} />)
    expect(await screen.findByRole('button', { name: /כניסה/i })).toBeInTheDocument()
  })

  it('redirects unknown paths to /daily when authenticated (via / → /daily)', async () => {
    mockFetch.mockReturnValue(makeResponse(true, { id: 1, role: 'employee' }))
    render(<AppShell initialEntries={['/some/unknown/path']} />)
    expect(await screen.findByText('daily-page')).toBeInTheDocument()
  })
})
