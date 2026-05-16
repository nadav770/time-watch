import { vi, describe, it, expect, beforeEach } from 'vitest'
import { getUsers, createUser, updateUser, deactivateUser } from './usersApi'

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '../api/client'

beforeEach(() => vi.clearAllMocks())

describe('getUsers', () => {
  it('calls GET /api/users', async () => {
    apiFetch.mockResolvedValue([])
    await getUsers()
    expect(apiFetch).toHaveBeenCalledWith('/api/users')
  })

  it('returns the response from apiFetch', async () => {
    const users = [{ id: '1', full_name: 'ישראל ישראלי', email: 'a@b.com', role: 'employee', is_active: true }]
    apiFetch.mockResolvedValue(users)
    const result = await getUsers()
    expect(result).toEqual(users)
  })

  it('propagates errors from apiFetch', async () => {
    apiFetch.mockRejectedValue({ status: 403 })
    await expect(getUsers()).rejects.toEqual({ status: 403 })
  })
})

describe('createUser', () => {
  it('calls POST /api/users with the provided data as JSON body', async () => {
    const data = { full_name: 'שרה לוי', email: 's@b.com', role: 'employee', password: 'Test1234!' }
    apiFetch.mockResolvedValue({ id: '2', ...data, is_active: true })
    await createUser(data)
    expect(apiFetch).toHaveBeenCalledWith('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  })

  it('returns the created user', async () => {
    const created = { id: '2', full_name: 'שרה לוי', email: 's@b.com', role: 'employee', is_active: true }
    apiFetch.mockResolvedValue(created)
    const result = await createUser({ full_name: 'שרה לוי', email: 's@b.com', role: 'employee', password: 'Test1234!' })
    expect(result).toEqual(created)
  })

  it('propagates errors from apiFetch', async () => {
    apiFetch.mockRejectedValue({ status: 409 })
    await expect(createUser({})).rejects.toEqual({ status: 409 })
  })
})

describe('updateUser', () => {
  it('calls PUT /api/users/:id with the correct URL and body', async () => {
    const data = { full_name: 'דני כהן' }
    apiFetch.mockResolvedValue({ id: 'abc', ...data })
    await updateUser('abc', data)
    expect(apiFetch).toHaveBeenCalledWith('/api/users/abc', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  })

  it('interpolates any id into the URL', async () => {
    apiFetch.mockResolvedValue({})
    await updateUser('xyz-123', {})
    expect(apiFetch).toHaveBeenCalledWith('/api/users/xyz-123', {
      method: 'PUT',
      body: JSON.stringify({}),
    })
  })

  it('propagates errors from apiFetch', async () => {
    apiFetch.mockRejectedValue({ status: 400 })
    await expect(updateUser('1', {})).rejects.toEqual({ status: 400 })
  })
})

describe('deactivateUser', () => {
  it('calls PATCH /api/users/:id/deactivate', async () => {
    apiFetch.mockResolvedValue({ is_active: false })
    await deactivateUser('abc')
    expect(apiFetch).toHaveBeenCalledWith('/api/users/abc/deactivate', { method: 'PATCH' })
  })

  it('interpolates any id into the URL', async () => {
    apiFetch.mockResolvedValue({})
    await deactivateUser('xyz-123')
    expect(apiFetch).toHaveBeenCalledWith('/api/users/xyz-123/deactivate', { method: 'PATCH' })
  })

  it('propagates errors from apiFetch (last-admin guard)', async () => {
    apiFetch.mockRejectedValue({ status: 400 })
    await expect(deactivateUser('1')).rejects.toEqual({ status: 400 })
  })
})
