import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { vi, it, expect, beforeEach } from 'vitest'
import { AuthProvider, useAuth } from '../../context/AuthContext'
import ProtectedRoute from '../../components/ProtectedRoute'
import LoginPage from './LoginPage'

// AuthContext calls fetch() directly — mock it globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeResponse(status, data) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  })
}

function LogoutButtonTest() {
  const auth = useAuth()
  const navigate = useNavigate()
  return (
    <button onClick={async () => { await auth.logout(); navigate('/login', { replace: true }) }}>
      התנתק
    </button>
  )
}

function AppShell() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<div>Home <LogoutButtonTest /></div>} />
      </Route>
    </Routes>
  )
}

function renderApp(initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// LoginPage auth-state behaviour
it('shows spinner on /login while auth is loading', () => {
  mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
  renderApp(['/login'])
  expect(screen.getByRole('status')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /כניסה/i })).not.toBeInTheDocument()
})

it('redirects authenticated user from /login to home', async () => {
  mockFetch.mockReturnValue(makeResponse(200, { id: 1, role: 'employee' }))
  renderApp(['/login'])
  await waitFor(() => expect(screen.getByText(/Home/)).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: /כניסה/i })).not.toBeInTheDocument()
})

// 15.1 valid session: spinner shows briefly then home renders — no redirect to /login
it('15.1 valid session on hard refresh: shows home without redirecting to login', async () => {
  mockFetch.mockReturnValue(makeResponse(200, { id: 1, role: 'employee' }))
  renderApp(['/'])
  await waitFor(() => expect(screen.getByText(/Home/)).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: /כניסה/i })).not.toBeInTheDocument()
})

// 15.2 expired session: /me fails → redirects to /login
it('15.2 expired session on hard refresh: redirects to /login', async () => {
  mockFetch.mockReturnValue(makeResponse(401, null))
  renderApp(['/'])
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /כניסה/i })).toBeInTheDocument()
  )
  expect(screen.queryByText(/Home/)).not.toBeInTheDocument()
})

// 15.3 successful login: redirects to home
it('15.3 successful login redirects to home', async () => {
  // First call: /api/auth/me → 401 (not logged in yet)
  // Second call: /api/auth/login → 200 with user
  mockFetch
    .mockReturnValueOnce(makeResponse(401, null))
    .mockReturnValueOnce(makeResponse(200, { id: 1, email: 'admin@test.com', role: 'admin' }))

  renderApp(['/login'])

  await userEvent.type(await screen.findByLabelText(/אימייל/i), 'admin@test.com')
  await userEvent.type(screen.getByLabelText('סיסמה'), '1234')
  await userEvent.click(screen.getByRole('button', { name: /כניסה/i }))

  await waitFor(() => expect(screen.getByText(/Home/)).toBeInTheDocument())
})

// 15.4 wrong credentials (401): Hebrew error shown, stays on /login
it('15.4 wrong credentials shows Hebrew 401 error', async () => {
  mockFetch
    .mockReturnValueOnce(makeResponse(401, null))
    .mockReturnValueOnce(makeResponse(401, { error: 'האימייל או הסיסמה שגויים' }))

  renderApp(['/login'])

  await userEvent.type(await screen.findByLabelText(/אימייל/i), 'wrong@test.com')
  await userEvent.type(screen.getByLabelText('סיסמה'), 'bad')
  await userEvent.click(screen.getByRole('button', { name: /כניסה/i }))

  await waitFor(() =>
    expect(screen.getByText('האימייל או הסיסמה שגויים')).toBeInTheDocument()
  )
  expect(screen.queryByText(/Home/)).not.toBeInTheDocument()
})

// 15.5 locked account (423): distinct Hebrew error shown, stays on /login
it('15.5 locked account shows Hebrew 423 error', async () => {
  mockFetch
    .mockReturnValueOnce(makeResponse(401, null))
    .mockReturnValueOnce(makeResponse(423, { error: 'locked' }))

  renderApp(['/login'])

  await userEvent.type(await screen.findByLabelText(/אימייל/i), 'locked@test.com')
  await userEvent.type(screen.getByLabelText('סיסמה'), '1234')
  await userEvent.click(screen.getByRole('button', { name: /כניסה/i }))

  await waitFor(() =>
    expect(screen.getByText('החשבון ננעל עקב ניסיונות התחברות מרובים')).toBeInTheDocument()
  )
  expect(screen.queryByText(/Home/)).not.toBeInTheDocument()
})

// 15.6 network error (no response): generic Hebrew error shown, stays on /login
it('15.6 network error shows generic Hebrew error', async () => {
  mockFetch
    .mockReturnValueOnce(makeResponse(401, null))    // /api/auth/me
    .mockRejectedValueOnce(new TypeError('Failed to fetch')) // /api/auth/login network fail

  renderApp(['/login'])

  await userEvent.type(await screen.findByLabelText(/אימייל/i), 'network@test.com')
  await userEvent.type(screen.getByLabelText('סיסמה'), '1234')
  await userEvent.click(screen.getByRole('button', { name: /כניסה/i }))

  await waitFor(() =>
    expect(screen.getByText('אירעה שגיאה. נסי שוב מאוחר יותר')).toBeInTheDocument()
  )
  expect(screen.queryByText(/Home/)).not.toBeInTheDocument()
})

// 15.7 logout: user is cleared, browser lands on /login
it('15.7 logout clears user and redirects to /login', async () => {
  // /api/auth/me → authenticated; /api/auth/logout → 200
  mockFetch
    .mockReturnValueOnce(makeResponse(200, { id: 1, role: 'employee' }))
    .mockReturnValueOnce(makeResponse(200, {}))

  renderApp(['/'])

  await waitFor(() => expect(screen.getByText(/Home/)).toBeInTheDocument())

  await userEvent.click(screen.getByRole('button', { name: /התנתק/i }))

  await waitFor(() =>
    expect(screen.getByRole('button', { name: /כניסה/i })).toBeInTheDocument()
  )
  expect(screen.queryByText(/Home/)).not.toBeInTheDocument()
})
