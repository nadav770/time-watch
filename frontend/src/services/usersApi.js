import { apiFetch } from '../api/client'

export function getUsers() {
  return apiFetch('/api/users')
}

export function createUser(data) {
  return apiFetch('/api/users', { method: 'POST', body: JSON.stringify(data) })
}

export function updateUser(id, data) {
  return apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deactivateUser(id) {
  return apiFetch(`/api/users/${id}/deactivate`, { method: 'PATCH' })
}

export function activateUser(id) {
  return apiFetch(`/api/users/${id}/activate`, { method: 'PATCH' })
}
