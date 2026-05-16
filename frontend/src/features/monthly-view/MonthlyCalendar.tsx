import { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_URL ?? ''
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  isAfter,
  startOfToday,
  getDay,
  startOfDay,
} from 'date-fns'
import { HebrewCalendar } from '@hebcal/core'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EditEntryModal from './EditEntryModal'
import { type Entry } from './EntryList'

// ─── Types ────────────────────────────────────────────────────────────────────

type DayStatus = 'full' | 'missing' | 'exceptional' | 'weekend' | 'holiday' | 'future'

interface DayData {
  date: string
  status: DayStatus
  totalHours: number
  entries: Entry[]
  absence: unknown | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HEB_MONTHS: Record<number, string> = {
  1: 'ינואר', 2: 'פברואר', 3: 'מרץ', 4: 'אפריל', 5: 'מאי', 6: 'יוני',
  7: 'יולי', 8: 'אוגוסט', 9: 'ספטמבר', 10: 'אוקטובר', 11: 'נובמבר', 12: 'דצמבר',
}

const HEB_DAY: Record<number, string> = {
  0: "יום א'", 1: "יום ב'", 2: "יום ג'", 3: "יום ד'",
  4: "יום ה'", 5: "יום ו'", 6: 'שבת',
}

function hoursToHHMM(h: number): string {
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function getJewishHolidays(year: number, month: number): Set<string> {
  const events = HebrewCalendar.calendar({
    year, month, isHebrewYear: false, il: true,
    noMinorFast: true, noModern: true, noRoshChodesh: true,
  } as object)
  const holidays = new Set<string>()
  for (const ev of events) {
    const d = ev.getDate().greg()
    holidays.add(format(d, 'yyyy-MM-dd'))
  }
  return holidays
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const BADGE: Record<string, { bg: string; text: string; dot: string; label: (h: number) => string }> = {
  full:        { bg: '#E3F9CA', text: '#3D7A1A', dot: '#5CB329', label: (h) => `${hoursToHHMM(h)} ש` },
  missing:     { bg: '#FCE3D6', text: '#C84B11', dot: '#E05A1F', label: ()  => 'חסר' },
  exceptional: { bg: '#FEF5CC', text: '#B07D00', dot: '#D4A017', label: (h) => `${hoursToHHMM(h)} ש` },
}

function StatusBadge({ status, totalHours }: { status: DayStatus; totalHours: number }) {
  const cfg = BADGE[status]
  if (!cfg) return <div className="w-[80px]" />
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {cfg.label(totalHours)}
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
    </span>
  )
}

// ─── Trash Icon ───────────────────────────────────────────────────────────────

function TrashIcon({ disabled }: { disabled: boolean }) {
  return (
    <svg
      className="w-5 h-5 flex-shrink-0"
      style={{ color: disabled ? '#D1D1D6' : '#8E8E93' }}
      fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-8 0h10" />
    </svg>
  )
}

// ─── Chevron Icon ─────────────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${open ? '' : 'rotate-180'}`}
      fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  )
}

// ─── DayRow ───────────────────────────────────────────────────────────────────

interface DayRowProps {
  day: Date
  dayData: DayData | undefined
  status: DayStatus
  isExpanded: boolean
  onToggle: () => void
  isLocked: boolean
  onEdit: (entry: Entry) => void
  onAddEntry: (date: string) => void
}

function DayRow({ day, dayData, status, isExpanded, onToggle, isLocked, onEdit, onAddEntry }: DayRowProps) {
  const isInteractive = status !== 'weekend' && status !== 'holiday' && status !== 'future'
  const dow = getDay(day)
  const dayLabel = HEB_DAY[dow]
  const displayDate = format(day, 'dd/MM/yy')
  const dateKey = format(day, 'yyyy-MM-dd')

  return (
    <div>
      {/* Day header — RTL flex: DOM order = visual right→left */}
      <div
        onClick={isInteractive ? onToggle : undefined}
        className={[
          'flex items-center gap-3 px-4 py-3.5 select-none',
          isInteractive ? 'cursor-pointer active:bg-gray-50' : 'cursor-default',
        ].join(' ')}
      >
        {/* Trash — visual RIGHT (RTL flex-start) */}
        <button
          onClick={(e) => e.stopPropagation()}
          className="p-1 -mr-1 flex-shrink-0"
          aria-label="מחק יום"
        >
          <TrashIcon disabled={!isInteractive} />
        </button>

        {/* Date + day name */}
        <span className="text-sm font-medium text-gray-800 whitespace-nowrap">
          {displayDate},{' '}
          <span className="text-gray-600">{dayLabel}</span>
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Status badge */}
        <StatusBadge status={status} totalHours={dayData?.totalHours ?? 0} />

        {/* Chevron — visual LEFT (RTL flex-end), grayed when non-interactive */}
        <span style={{ opacity: isInteractive ? 1 : 0.3 }}>
          <ChevronIcon open={isExpanded} />
        </span>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-white">
          {(!dayData || dayData.entries.length === 0) ? (
            <p className="text-xs text-gray-400 text-center py-3">אין דיווחים ליום זה</p>
          ) : (
            dayData.entries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
                {/* Edit btn — visual RIGHT (RTL first) */}
                <button
                  onClick={() => !isLocked && onEdit(entry)}
                  disabled={isLocked}
                  className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0 min-h-[32px]"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 1 1 3.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <span>עריכה</span>
                </button>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Entry details — visual LEFT (RTL last), text-right */}
                <div className="text-right">
                  <p className="text-sm font-semibold" style={{ color: '#0066CC' }}>
                    {entry.start_time.slice(0, 5)}-{entry.end_time.slice(0, 5)}
                  </p>
                  <p className="text-sm text-gray-800">{entry.client_name}</p>
                  <p className="text-xs text-gray-500">
                    ש׳ {hoursToHHMM(entry.duration_hours)} {entry.project_name}
                  </p>
                </div>
              </div>
            ))
          )}

          {/* Add entry */}
          {!isLocked && (
            <button
              onClick={() => onAddEntry(dateKey)}
              className="w-full py-3 text-sm font-medium text-center"
              style={{ color: '#00B0AA' }}
            >
              הוספת דיווח
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MonthlyCalendar() {
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const [currentDate, setCurrentDate] = useState(startOfMonth(new Date()))
  const [dayDataMap, setDayDataMap] = useState<Record<string, DayData>>({})
  const [loading, setLoading] = useState(false)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const isLocked = false

  const monthStr = format(currentDate, 'yyyy-MM')
  const isFutureMonth = isAfter(currentDate, startOfMonth(startOfToday()))

  useEffect(() => {
    if (isFutureMonth) return
    setLoading(true)
    setExpandedDate(null)
    fetch(`${API_BASE}/api/work-entries?month=${monthStr}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const map: Record<string, DayData> = {}
        for (const day of data.days ?? []) map[day.date] = day
        setDayDataMap(map)
      })
      .catch(() => setDayDataMap({}))
      .finally(() => setLoading(false))
  }, [monthStr, isFutureMonth])

  const today = startOfToday()
  const holidays = getJewishHolidays(currentDate.getFullYear(), currentDate.getMonth() + 1)

  // Descending order — most recent day first
  const days = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  }).reverse()

  function getDayStatus(day: Date): DayStatus {
    const dateStr = format(day, 'yyyy-MM-dd')
    if (isAfter(startOfDay(day), today)) return 'future'
    const dow = getDay(day)
    if (dow === 5 || dow === 6) return 'weekend'
    if (holidays.has(dateStr)) return 'holiday'
    const data = dayDataMap[dateStr]
    if (!data) return loading ? 'future' : 'missing'
    return data.status as DayStatus
  }

  const monthName = HEB_MONTHS[currentDate.getMonth() + 1]
  const year = currentDate.getFullYear()

  return (
    <div dir="rtl" className="min-h-screen pb-6" style={{ background: '#F2F2F7' }}>
      <div className="mx-4 mt-4 lg:max-w-[740px] lg:mx-auto lg:mt-6 bg-white rounded-2xl shadow-sm overflow-hidden">

        {/* Card header */}
        <div
          className="flex items-start justify-between px-4 pt-4 pb-3"
          style={{ borderBottom: '1px dashed #B3D9F7' }}
        >
          {/* Month navigation — visual LEFT (RTL: last in DOM) */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => !isFutureMonth && setCurrentDate(addMonths(currentDate, 1))}
              disabled={isFutureMonth}
              className="w-7 h-7 flex items-center justify-center text-gray-500 disabled:opacity-30"
              aria-label="חודש הבא"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-800">{monthName}</span>
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="w-7 h-7 flex items-center justify-center text-gray-500"
              aria-label="חודש קודם"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Title — visual RIGHT (RTL: first in DOM) */}
          <div className="text-right">
            <h2 className="text-base font-bold text-gray-800">דיווח שעות</h2>
            <p className="text-xs text-gray-400 mt-0.5"
              style={{ borderBottom: '1px dashed #B3D9F7', paddingBottom: 2 }}
            >
              שימת הדיווחים היומיים - לחודש {monthName} {year}
            </p>
            <button
              type="button"
              onClick={() => navigate(`/absences/new?month=${monthStr}`)}
              className="mt-3 px-3 py-2 rounded-lg text-sm font-semibold text-white min-h-[44px]"
              style={{ background: '#0C69FF' }}
            >
              דיווח היעדרות
            </button>
          </div>
        </div>

        {/* Day list */}
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">טוען נתונים…</span>
          </div>
        ) : isFutureMonth ? (
          <div className="py-16 text-center text-gray-400">
            <p className="text-sm font-medium">לא הגענו לחודש הזה עדיין</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {days.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd')
              const status = getDayStatus(day)
              return (
                <DayRow
                  key={dateKey}
                  day={day}
                  dayData={dayDataMap[dateKey]}
                  status={status}
                  isExpanded={expandedDate === dateKey}
                  onToggle={() => setExpandedDate((prev) => (prev === dateKey ? null : dateKey))}
                  isLocked={isLocked}
                  onEdit={setEditingEntry}
                  onAddEntry={(date) => setSearchParams({ report: 'work', date })}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSaved={(updated) => {
            setDayDataMap((prev) => {
              const day = prev[updated.date]
              if (!day) return prev
              return {
                ...prev,
                [updated.date]: {
                  ...day,
                  entries: day.entries.map((e) => (e.id === updated.id ? updated : e)),
                },
              }
            })
            setEditingEntry(null)
          }}
        />
      )}
    </div>
  )
}
