'use strict'

export type DayStatus = 'weekend' | 'missing' | 'full' | 'exceptional'

export interface WorkEntryLike {
  start_time: string;
  end_time: string;
}

export interface AbsenceLike {
  [key: string]: unknown;
}

// Parse a time string "HH:MM:SS" or "HH:MM" into decimal hours.
function parseTimeToHours(timeStr: string): number {
  const parts = timeStr.split(':').map(Number)
  const hours = parts[0] || 0
  const minutes = parts[1] || 0
  const seconds = parts[2] || 0
  return hours + minutes / 60 + seconds / 3600
}

// Compute the display status for a single calendar day.
export function computeDayStatus(
  dateStr: string,
  entries: WorkEntryLike[],
  absence: AbsenceLike | null
): DayStatus {
  // Weekend check: Friday = 5, Saturday = 6 (UTC day)
  const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay()
  if (dow === 5 || dow === 6) {
    return 'weekend'
  }

  // No entries and no absence → missing
  if ((!entries || entries.length === 0) && !absence) {
    return 'missing'
  }

  // Absence covers the day → full regardless of hours
  if (absence) {
    return 'full'
  }

  // Calculate total hours from entries
  const totalHours = entries.reduce((sum, entry) => {
    const start = parseTimeToHours(entry.start_time)
    const end = parseTimeToHours(entry.end_time)
    return sum + (end - start)
  }, 0)

  // Exactly 9 hours → full; any other amount → exceptional
  if (totalHours === 9) {
    return 'full'
  }

  return 'exceptional'
}
