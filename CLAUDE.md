# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Time Watch** (מערכת דיווחי שעות) — A web app for employees to report daily work hours and absences, with an admin panel for managing users, clients, projects, and tasks.

- **Frontend**: React + TypeScript, Vite, Tailwind CSS, mobile-first, Hebrew (RTL) only
- **Backend**: Node.js + Express, Knex (PostgreSQL query builder) — **must be written in TypeScript**
- **Database**: PostgreSQL 16
- **Containerization**: Docker + Docker Compose
- **Deployment**: Netlify (frontend) → Render (backend at `time-watch.onrender.com`)

## Commands

```bash
# Start all services (frontend :5173, backend :3000, db :5433)
docker compose up
docker compose up --build   # rebuild images first
docker compose down

# Backend (from backend/)
npm run dev                  # nodemon dev server
npm test                     # Jest with coverage (serial — maxWorkers: 1)
npm test -- --testPathPattern=routes/reports   # run a single test file

# Frontend (from frontend/)
npm run dev                  # Vite dev server
npm test                     # Vitest watch mode
npm run test:coverage        # Vitest with coverage report

# DB migrations (from backend/)
npm run migrate              # knex migrate:latest
npm run migrate:rollback     # knex migrate:rollback
npm run seed                 # knex seed:run
```

Swagger API docs at `/api-docs` when the backend is running.

Tests must pass before any merge to `main`. Minimum 60% code coverage required (backend); frontend threshold is currently 30%. Write tests per feature during development.

## Architecture

```
frontend/   React app (Hebrew/RTL, mobile-first)
backend/    Node.js REST API
db/         PostgreSQL schema and migrations
```

### Backend layers

```
routes/          Express routers — validation, auth guards, HTTP shape
services/        Business logic (authService, usersService)
repositories/    DB query functions (usersRepository, workEntryRepository, timerRepository)
db/knex.js       Knex connection singleton
middleware/      auth.js (JWT extraction + requireRole), errorHandler.js
config/          env.js, swagger.js, constants.js
```

**All backend code must be written in TypeScript** (`.ts` files). The existing codebase is in JavaScript — any new code or refactored files should be TypeScript.

Most routes query Knex directly rather than going through a repository. The repository layer exists only for modules that were extracted (users, work entries, timer). New routes may use either pattern; prefer the repository layer for non-trivial query logic.

**Auth**: JWT stored in an httpOnly cookie (8 h lifetime). The `authenticate` middleware validates the token signature only — no DB round-trip per request. Only `/api/auth/me` and `/api/auth/change-password` re-verify the user against the DB. Routes that require admin access use `requireRole('admin')`.

### Frontend layers

```
features/        Page-level feature slices (auth, admin, daily-reporting, absences, monthly-view, home)
components/      Shared layout and guards (Layout, ProtectedRoute, AdminRoute)
context/         AuthContext.tsx — session state (user, login, logout, patchUser)
api/client.js    apiFetch() — thin fetch wrapper, all paths relative (e.g. /api/reports)
services/        usersApi.js — per-resource API functions
hooks/           Custom React hooks
```

All API calls use `apiFetch` from `api/client.js`. Paths are relative; Vite's dev server proxies `/api` to `http://localhost:3000`, and Netlify's `netlify.toml` proxies `/api/*` to Render in production.

**Routing**: React Router v6. `ProtectedRoute` redirects unauthenticated users to `/login`. `AdminRoute` additionally enforces the admin role. The default route `/` redirects to `/monthly`.

### Data model hierarchy

```
Client → Project → Task → UserTask (assignment)
```

Users are assigned to **tasks** (not clients/projects). Reporting dropdowns auto-filter and auto-select when only one option is available. **Soft deletes** everywhere — never hard-delete rows.

### Two user roles

- **Regular (employee)**: report hours/absences, view own history, edit until month is locked
- **Admin**: all employee capabilities + manage users/clients/projects/tasks, edit any report, lock/unlock months. All admin edits to employee reports are logged.

**User creation**: admins create all users including the initial password. No self-registration. First-login forces a password change (`must_change_password` flag).

**Month locking**: admin locks a month, freezing all reports. Lock metadata (timestamp + who) is stored. Admin can reopen.

## Testing

**Backend (Jest)**: tests run serially (`maxWorkers: 1`) because all test files share one PostgreSQL database and run `migrate:rollback` / `migrate:latest` in `beforeAll`/`afterAll`. Tests that need auth tokens use the helpers in `src/__tests__/helpers/`. Route tests are co-located in `src/routes/*.test.js`; unit tests are in `src/__tests__/`.

**Frontend (Vitest)**: runs in jsdom. Test utilities are in `src/test-utils/`. Component tests use `@testing-library/react`.

## Business Rules

### Time Reporting Validations
- End time before start time → **error**
- Total hours below 9h daily standard → **warning**
- Total hours above 9h daily standard → **warning**
- A single day supports multiple report rows (different clients/projects/tasks). The UI tracks remaining hours and blocks closing the report until all hours are assigned.
- Timer mode: start/stop buttons auto-capture start/end times.

### Absences
- Partial-day absence requires a complementary hours report for the rest of the day.
- Sick leave and military reserve duty require a document upload (can be submitted after initial report).
- Friday and Saturday are automatically excluded from absence date range calculations.

### Monthly View
- Calendar with per-day status indicator: complete / missing / irregular.

## System Constants

| Parameter | Value |
|---|---|
| Daily standard hours | 9 |
| Work locations | משרד, לקוח, בית |
| Absence types | חופשה, מחלה, מילואים |
| User types | רגיל, אדמין |

Local DB port is **5433** (mapped from container's 5432) to avoid conflicts with a local PostgreSQL install.

## Git Workflow

- `main` is branch-protected — no direct pushes
- All changes via Pull Requests with at least 1 code review before merge
- All CI tests must pass before merge

## General

- Add a short one-line comment at the top of every function describing what it does.
