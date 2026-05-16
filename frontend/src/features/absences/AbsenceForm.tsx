import { forwardRef, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type MouseEventHandler } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import './AbsenceForm.css'
import { IconUpload, IconTrash } from './absenceIcons'
import { createAbsence, deleteDocument, updateAbsence, uploadDocument } from './absencesApi'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

type AbsenceType = 'vacation' | 'half_day_vac' | 'sick' | 'military_reserve'
type LegacyAbsenceType = AbsenceType
type AbsenceDuration = 'single' | 'range'
type UploadStatus = 'success' | 'error' | null
export type AbsenceDocument = File | { name: string } | string | null

type AbsenceInitialValues = {
  id?: number
  type?: LegacyAbsenceType | ''
  duration?: AbsenceDuration
  startDate?: string
  start_date?: string
  endDate?: string
  end_date?: string
  notes?: string
  document?: AbsenceDocument
  document_filename?: string | null
}

type AbsenceFormValues = {
  id?: number
  type: AbsenceType | ''
  duration: AbsenceDuration
  startDate: string
  endDate: string
  notes: string
  document: AbsenceDocument
}

type AbsenceFormErrors = Partial<Record<'type' | 'startDate' | 'endDate' | 'document' | 'form', string>>

export type AbsencePayload = {
  id?: number
  type: AbsenceType
  startDate: string
  endDate: string
  workDays: number
  notes: string
  document: AbsenceDocument
}

type AbsenceFormProps = {
  onClose?: () => void
  onSave?: (absence: AbsencePayload) => void | Promise<{ id?: number } | void>
  initialValues?: AbsenceInitialValues
  reportingMonth?: string | null
  onSwitchToWork?: () => void
}

type DateFieldButtonProps = {
  label: string
  value: string
  onClick?: MouseEventHandler<HTMLButtonElement>
}

const MAX_FILE_SIZE = 20 * 1024 * 1024
const TODAY = new Date()
TODAY.setHours(0, 0, 0, 0)
const REQUIRED_DOCUMENT_ERROR = 'עליך להעלות מסמך כדי להמשיך'

const ABSENCE_TYPES = [
  { value: 'vacation', label: 'חופשה' },
  { value: 'half_day_vac', label: 'חצי יום חופש' },
  { value: 'sick', label: 'מחלה' },
  { value: 'military_reserve', label: 'מילואים' },
] satisfies Array<{ value: AbsenceType; label: string }>

const ABSENCE_TYPE_LABELS = ABSENCE_TYPES.reduce(
  (labels, option) => ({ ...labels, [option.value]: option.label }),
  {} as Record<AbsenceType, string>,
)

const DURATION_OPTIONS = [
  { value: 'single', label: 'יום אחד' },
  { value: 'range', label: 'מספר ימים' },
] satisfies Array<{ value: AbsenceDuration; label: string }>

const DURATION_LABELS = DURATION_OPTIONS.reduce(
  (labels, option) => ({ ...labels, [option.value]: option.label }),
  {} as Record<AbsenceDuration, string>,
)

const EMPTY_FORM: AbsenceFormValues = {
  type: '',
  duration: 'single',
  startDate: '',
  endDate: '',
  notes: '',
  document: null,
}

function normalizeType(type: LegacyAbsenceType | '' | undefined): AbsenceType | '' {
  return type ?? ''
}

function normalizeInitialValues(initialValues?: AbsenceInitialValues): AbsenceFormValues {
  const startDate = initialValues?.startDate ?? initialValues?.start_date ?? ''
  const endDate = initialValues?.endDate ?? initialValues?.end_date ?? startDate
  const type = normalizeType(initialValues?.type)
  const document = initialValues?.document ?? initialValues?.document_filename ?? null
  return {
    ...EMPTY_FORM,
    id: initialValues?.id,
    type,
    duration: type === 'half_day_vac' ? 'single' : (initialValues?.duration ?? (endDate && endDate !== startDate ? 'range' : 'single')),
    startDate,
    endDate: endDate === startDate ? '' : endDate,
    notes: initialValues?.notes ?? '',
    document,
  }
}

function formatDateDisplay(dateStr: string) {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  return year && month && day ? `${day}.${month}.${year}` : dateStr
}

function parseLocalDate(dateStr: string) {
  if (!dateStr) return null
  const [year, month, day] = dateStr.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function toDateInputValue(date: Date | null) {
  if (!date) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDateSummary(duration: AbsenceDuration, startDate: string, endDate: string) {
  if (duration === 'single') return startDate ? formatDateDisplay(startDate) : 'בחר תאריך'
  if (startDate && endDate) return `${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`
  if (startDate) return `${formatDateDisplay(startDate)} - בחר תאריך סיום`
  return 'בחר טווח תאריכים'
}

function isFutureDate(dateStr: string) {
  const date = parseLocalDate(dateStr)
  return Boolean(date && date > TODAY)
}

function isDifferentMonth(startDate: string, endDate: string) {
  if (!startDate || !endDate) return false
  return startDate.slice(0, 7) !== endDate.slice(0, 7)
}

function isValidMonth(month: string | null | undefined) {
  return Boolean(month && /^\d{4}-\d{2}$/.test(month))
}

function firstDayOfMonth(month: string | null | undefined) {
  if (!isValidMonth(month)) return null
  const [year, monthNumber] = month!.split('-').map(Number)
  return new Date(year, monthNumber - 1, 1)
}

function lastDayOfMonth(month: string | null | undefined) {
  if (!isValidMonth(month)) return null
  const [year, monthNumber] = month!.split('-').map(Number)
  return new Date(year, monthNumber, 0)
}

function minDate(a: Date, b: Date) {
  return a < b ? a : b
}

function countWorkDays(startStr: string, endStr: string) {
  const start = parseLocalDate(startStr)
  const end = parseLocalDate(endStr)
  if (!start || !end || end < start) return 0
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const day = cur.getDay()
    if (day !== 5 && day !== 6) count += 1
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function datesInRange(startDate: string, endDate: string) {
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)
  if (!start || !end || end < start) return []
  const dates: string[] = []
  const cur = new Date(start)
  while (cur <= end) {
    dates.push(toDateInputValue(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function extractEntries(data: unknown, date: string) {
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return []
  const shaped = data as { entries?: unknown[]; days?: Array<{ date?: string; entries?: unknown[] }> }
  if (Array.isArray(shaped.entries)) return shaped.entries
  const day = shaped.days?.find(item => item.date === date)
  return Array.isArray(day?.entries) ? day.entries : []
}

function documentName(document: AbsenceDocument) {
  if (!document) return ''
  return typeof document === 'string' ? document : document.name
}

function requiresDocument(type: AbsenceFormValues['type']) {
  return type === 'sick' || type === 'military_reserve'
}

function validate(values: AbsenceFormValues, fileError = '', reportingMonth?: string | null) {
  const errs: AbsenceFormErrors = {}
  const effectiveEndDate = values.duration === 'single' ? values.startDate : values.endDate
  const futureBlocked = !requiresDocument(values.type)

  if (!values.type) errs.type = 'שדה חובה'
  if (!values.startDate) errs.startDate = 'שדה חובה'
  if (values.duration === 'range' && !values.endDate) errs.endDate = 'שדה חובה'
  if (values.duration === 'range' && values.startDate && values.endDate && values.endDate < values.startDate) {
    errs.endDate = 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה'
  }
  if (futureBlocked && (isFutureDate(values.startDate) || isFutureDate(effectiveEndDate))) {
    errs.startDate = 'לא ניתן לדווח תאריך עתידי לסוג היעדרות זה'
  }
  if (isDifferentMonth(values.startDate, effectiveEndDate)) {
    errs.endDate = 'לא ניתן לדווח טווח תאריכים שחוצה חודשים'
  }
  if (isValidMonth(reportingMonth)) {
    if ((values.startDate && values.startDate.slice(0, 7) !== reportingMonth) ||
        (effectiveEndDate && effectiveEndDate.slice(0, 7) !== reportingMonth)) {
      errs.endDate = 'ניתן לדווח רק על תאריכים בחודש הנבחר'
    }
  }
  if (requiresDocument(values.type) && !values.document) errs.document = REQUIRED_DOCUMENT_ERROR
  if (fileError) errs.document = fileError
  return errs
}

function liveValidationErrors(values: AbsenceFormValues, fileError = '', reportingMonth?: string | null) {
  const errs = validate(values, fileError, reportingMonth)
  if (!values.type) delete errs.type
  if (!values.startDate) delete errs.startDate
  if (values.duration === 'range' && !values.endDate) delete errs.endDate
  if (requiresDocument(values.type) && !values.document && !fileError) delete errs.document
  return errs
}

const DateFieldButton = forwardRef<HTMLButtonElement, DateFieldButtonProps>(
  ({ label, value, onClick }, ref) => (
    <button
      ref={ref}
      type="button"
      className="af-card-row af-card-row-button"
      onClick={onClick}
      aria-label={label}
    >
      <span className="af-row-tag">{label}</span>
      <span className="af-row-title">{value}</span>
      <span className="af-chevron" aria-hidden="true">›</span>
    </button>
  ),
)
DateFieldButton.displayName = 'DateFieldButton'

export default function AbsenceForm({ onClose = () => {}, onSave, initialValues, reportingMonth, onSwitchToWork }: AbsenceFormProps) {
  const [values, setValues] = useState<AbsenceFormValues>(() => normalizeInitialValues(initialValues))
  const [errors, setErrors] = useState<AbsenceFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDurationPickerOpen, setIsDurationPickerOpen] = useState(false)
  const [isTypePickerOpen, setIsTypePickerOpen] = useState(false)
  const [draftDuration, setDraftDuration] = useState<AbsenceDuration>(values.duration)
  const [draftType, setDraftType] = useState<AbsenceType | ''>(values.type)
  const [fileError, setFileError] = useState('')
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>(values.document ? 'success' : null)
  const [successMessage, setSuccessMessage] = useState('')
  const [pendingPayload, setPendingPayload] = useState<AbsencePayload | null>(null)
  const [showConflictModal, setShowConflictModal] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const effectiveEndDate = values.duration === 'single' ? values.startDate : values.endDate
  const workDays = values.type === 'half_day_vac' ? 0.5 : countWorkDays(values.startDate, effectiveEndDate)
  const liveErrors = useMemo(() => liveValidationErrors(values, fileError, reportingMonth), [values, fileError, reportingMonth])
  const visibleErrors = { ...liveErrors, ...errors }
  const dateFieldLabel = values.duration === 'single' ? 'תאריך' : 'טווח תאריכים'
  const dateFieldSummary = getDateSummary(values.duration, values.startDate, values.endDate)
  const startDateValue = parseLocalDate(values.startDate)
  const endDateValue = parseLocalDate(values.endDate)
  const showDocumentField = requiresDocument(values.type)
  const monthMinDate = firstDayOfMonth(reportingMonth)
  const monthMaxDate = lastDayOfMonth(reportingMonth)
  const datePickerMinDate = monthMinDate ?? undefined
  const futureRuleMaxDate = values.type === 'sick' || values.type === 'military_reserve' ? undefined : TODAY
  const datePickerMaxDate = monthMaxDate && futureRuleMaxDate
    ? minDate(monthMaxDate, futureRuleMaxDate)
    : (monthMaxDate ?? futureRuleMaxDate)

  function updateValues(updater: (prev: AbsenceFormValues) => AbsenceFormValues) {
    setSuccessMessage('')
    setErrors(prev => ({ form: prev.form }))
    setValues(updater)
  }

  function setDuration(duration: AbsenceDuration) {
    updateValues(prev => ({ ...prev, duration, endDate: duration === 'single' ? '' : prev.endDate }))
  }

  function applyDuration() {
    setDuration(draftDuration)
    setIsDurationPickerOpen(false)
  }

  function applyType() {
    updateValues(prev => ({
      ...prev,
      type: draftType,
      duration: draftType === 'half_day_vac' ? 'single' : prev.duration,
      endDate: draftType === 'half_day_vac' ? '' : prev.endDate,
      document: requiresDocument(draftType) ? prev.document : null,
    }))
    if (!requiresDocument(draftType)) {
      setFileError('')
      setUploadStatus(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    setIsTypePickerOpen(false)
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setSuccessMessage('')
    setUploadStatus(null)
    if (file && file.size > MAX_FILE_SIZE) {
      setFileError('הקובץ גדול מדי (מקסימום 20MB)')
      setValues(prev => ({ ...prev, document: null }))
      return
    }
    setFileError('')
    setValues(prev => ({ ...prev, document: file }))
  }

  async function handleRemoveFile() {
    setSuccessMessage('')
    if (values.id && uploadStatus === 'success') {
      try {
        await deleteDocument(values.id)
      } catch (err) {
        setErrors(prev => ({ ...prev, form: err instanceof Error ? err.message : 'מחיקת הקובץ נכשלה' }))
        return
      }
    }
    setValues(prev => ({ ...prev, document: null }))
    setUploadStatus(null)
    setFileError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function buildPayload(): AbsencePayload {
    return {
      id: values.id,
      type: values.type as AbsenceType,
      startDate: values.startDate,
      endDate: effectiveEndDate,
      workDays,
      notes: values.notes,
      document: values.document,
    }
  }

  async function hasWorkEntryConflict(payload: AbsencePayload) {
    const dates = datesInRange(payload.startDate, payload.endDate)
    const months = [...new Set(dates.map(d => d.slice(0, 7)))]
    const monthData: Record<string, unknown> = {}
    for (const month of months) {
      const res = await fetch(`${API_BASE}/api/work-entries?month=${encodeURIComponent(month)}`, { credentials: 'include' })
      if (!res.ok) continue
      monthData[month] = await res.json().catch(() => null)
    }
    for (const date of dates) {
      const data = monthData[date.slice(0, 7)]
      if (extractEntries(data, date).length > 0) return true
    }
    return false
  }

  async function savePayload(payload: AbsencePayload) {
    setIsSubmitting(true)
    setErrors({})
    try {
      let savedId = payload.id
      if (onSave) {
        const customResult = await onSave(payload)
        savedId = customResult?.id ?? savedId
      } else {
        const apiPayload = {
          type: payload.type,
          start_date: payload.startDate,
          end_date: payload.endDate,
          is_partial: payload.type === 'half_day_vac',
          partial_hours: payload.type === 'half_day_vac' ? 4.5 : null,
          notes: payload.notes,
        }
        const result = payload.id
          ? await updateAbsence(payload.id, apiPayload)
          : await createAbsence(apiPayload)
        savedId = result?.id ?? savedId
      }

      if (payload.document instanceof File && savedId) {
        try {
          await uploadDocument(savedId, payload.document)
          setUploadStatus('success')
          setValues(prev => ({ ...prev, id: savedId, document: payload.document }))
        } catch {
          setUploadStatus('error')
          setErrors(prev => ({ ...prev, document: 'אירעה תקלה בטעינת הקובץ' }))
          return
        }
      }

      setSuccessMessage('הדיווח נשמר בהצלחה')
      if (!(payload.document instanceof File)) {
        setValues(EMPTY_FORM)
        setUploadStatus(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
      setFileError('')
    } catch (err) {
      setErrors(prev => ({ ...prev, form: err instanceof Error ? err.message : 'שמירת הדיווח נכשלה' }))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSuccessMessage('')
    const nextErrors = validate(values, fileError, reportingMonth)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    const payload = buildPayload()
    setIsSubmitting(true)
    try {
      const conflict = await hasWorkEntryConflict(payload)
      if (conflict) {
        setPendingPayload(payload)
        setShowConflictModal(true)
        return
      }
      await savePayload(payload)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function replaceConflictingEntries() {
    if (!pendingPayload) return
    setShowConflictModal(false)
    const payload = pendingPayload
    setPendingPayload(null)
    await savePayload(payload)
  }

  function cancelConflict() {
    setShowConflictModal(false)
    setPendingPayload(null)
  }

  return (
    <div
      className="af-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="af-title"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      dir="rtl"
    >
      <div className="af-sheet">
        <div className="af-handle" aria-hidden="true" />

        <form className="af-scroll" onSubmit={handleSubmit} noValidate>
          <div className="af-header">
            <h2 id="af-title" className="af-title">
              {initialValues ? 'עריכת היעדרות' : 'דיווח היעדרות'}
            </h2>
            <button type="button" className="af-close-btn" aria-label="סגור" onClick={onClose}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {!initialValues && (
            <div className="af-segmented" role="tablist" aria-label="בחירת סוג דיווח">
              <button type="button" className="af-seg-option af-seg-option--inactive" role="tab" aria-selected="false" onClick={onSwitchToWork ?? onClose}>
                דיווח עבודה
              </button>
              <button type="button" className="af-seg-option af-seg-option--active" role="tab" aria-selected="true">
                דיווח היעדרות
              </button>
            </div>
          )}

          <div>
            <div className="af-card">
              {values.type !== 'half_day_vac' && (
                <button type="button" className="af-card-row af-card-row-button" onClick={() => {
                  setDraftDuration(values.duration)
                  setIsDurationPickerOpen(true)
                }} aria-label="בחירת משך">
                  <span className="af-row-tag">משך</span>
                  <span className="af-row-title">{DURATION_LABELS[values.duration]}</span>
                  <span className="af-chevron" aria-hidden="true">›</span>
                </button>
              )}

              <div className="af-datepicker-row">
                {values.duration === 'single' ? (
                  <DatePicker
                    selected={startDateValue}
                    onChange={(date: Date | null) => updateValues(prev => ({ ...prev, startDate: toDateInputValue(date), endDate: '' }))}
                    minDate={datePickerMinDate}
                    maxDate={datePickerMaxDate}
                    customInput={<DateFieldButton label={dateFieldLabel} value={dateFieldSummary} />}
                    dateFormat="dd.MM.yyyy"
                    portalId="af-datepicker-portal"
                    popperClassName="af-datepicker-popper"
                    popperPlacement="bottom-end"
                  />
                ) : (
                  <DatePicker
                    selectsRange
                    startDate={startDateValue}
                    endDate={endDateValue}
                    onChange={(dates: [Date | null, Date | null]) => {
                      const [start, end] = dates
                      updateValues(prev => ({ ...prev, startDate: toDateInputValue(start), endDate: toDateInputValue(end) }))
                    }}
                    minDate={datePickerMinDate}
                    maxDate={datePickerMaxDate}
                    customInput={<DateFieldButton label={dateFieldLabel} value={dateFieldSummary} />}
                    dateFormat="dd.MM.yyyy"
                    portalId="af-datepicker-portal"
                    popperClassName="af-datepicker-popper"
                    popperPlacement="bottom-end"
                  />
                )}
              </div>

              <button type="button" className="af-card-row af-card-row-button" onClick={() => {
                setDraftType(values.type)
                setIsTypePickerOpen(true)
              }} aria-label="בחירת סוג דיווח">
                <span className="af-row-tag">סוג דיווח</span>
                <span className="af-row-title">{values.type ? ABSENCE_TYPE_LABELS[values.type] : 'בחר סוג דיווח'}</span>
                <span className="af-chevron" aria-hidden="true">›</span>
              </button>
            </div>
            <div className="af-workdays-badge" aria-live="polite">
              {workDays} ימי עבודה (ללא שישי–שבת)
            </div>
            {visibleErrors.type && <p className="af-error-msg" role="alert">{visibleErrors.type}</p>}
            {visibleErrors.startDate && <p className="af-error-msg" role="alert">{visibleErrors.startDate}</p>}
            {visibleErrors.endDate && <p className="af-error-msg" role="alert">{visibleErrors.endDate}</p>}
          </div>

          {showDocumentField && (
            <div>
              <div className="af-upload-title">צירוף קבצים רלוונטיים</div>
              {values.document ? (
                <div className="af-file-row">
                  <button type="button" className="af-file-remove" onClick={handleRemoveFile} aria-label="הסר קובץ">
                    <IconTrash />
                  </button>
                  <div className="af-file-content">
                    <span className="af-file-name">{documentName(values.document)}</span>
                    {uploadStatus === 'success' && (
                      <span className="af-file-status">
                        הקובץ עלה בהצלחה
                        <span className="af-file-status-check" aria-hidden="true">✓</span>
                      </span>
                    )}
                    {uploadStatus === 'error' && <span className="af-error-msg">אירעה תקלה בטעינת הקובץ</span>}
                  </div>
                  <div className="af-file-preview" aria-hidden="true">
                    <span className="af-file-fold" />
                    <span className="af-file-type">PDF</span>
                  </div>
                </div>
              ) : (
                <label className="af-upload-zone" tabIndex={0}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileChange}
                    aria-label="העלאת מסמך"
                  />
                  <div className="af-upload-icon-wrap" aria-hidden="true">
                    <IconUpload />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <span className="af-upload-btn-text">לחץ להעלאת קובץ</span>
                    <span className="af-upload-sub">PDF, JPG, PNG עד 20MB</span>
                  </div>
                </label>
              )}
              {visibleErrors.document && <p className="af-error-msg" role="alert">{visibleErrors.document}</p>}
            </div>
          )}

          {visibleErrors.form && <p className="af-error-msg af-error-msg--form" role="alert">{visibleErrors.form}</p>}
          {successMessage && <p className="af-file-status" role="status">{successMessage}</p>}
        </form>

        <div className="af-footer">
          <button
            type="submit"
            className="af-btn-primary"
            disabled={isSubmitting}
            onClick={e => {
              e.preventDefault()
              const form = (e.currentTarget.closest('.af-sheet') as HTMLElement)?.querySelector('form')
              form?.requestSubmit()
            }}
          >
            {isSubmitting ? 'שומר...' : initialValues ? 'שמור שינויים' : 'שמירה'}
          </button>
          <button type="button" className="af-btn-secondary" onClick={onClose}>
            ביטול
          </button>
        </div>

        {isDurationPickerOpen && (
          <div className="af-choice-panel" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="af-duration-title">
            <div className="af-choice-header">
              <button type="button" className="af-choice-icon-btn af-choice-icon-btn--close" onClick={() => setIsDurationPickerOpen(false)} aria-label="סגור">×</button>
              <h3 id="af-duration-title" className="af-choice-title">בחירת משך</h3>
              <button type="button" className="af-choice-icon-btn" onClick={() => setIsDurationPickerOpen(false)} aria-label="חזרה">›</button>
            </div>

            <div className="af-choice-card" role="radiogroup" aria-label="משך">
              {DURATION_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={`af-choice-row ${draftDuration === option.value ? 'af-choice-row--selected' : ''}`}
                  role="radio"
                  aria-checked={draftDuration === option.value}
                  onClick={() => setDraftDuration(option.value)}
                >
                  <span className="af-choice-check" aria-hidden="true">{draftDuration === option.value ? '✓' : ''}</span>
                  <span className="af-choice-label">{option.label}</span>
                </button>
              ))}
            </div>

            <div className="af-choice-footer">
              <button type="button" className="af-btn-primary" onClick={applyDuration}>המשך</button>
              <button type="button" className="af-btn-secondary" onClick={() => setIsDurationPickerOpen(false)}>ביטול</button>
            </div>
          </div>
        )}

        {isTypePickerOpen && (
          <div className="af-choice-panel" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="af-type-title">
            <div className="af-choice-header">
              <button type="button" className="af-choice-icon-btn af-choice-icon-btn--close" onClick={() => setIsTypePickerOpen(false)} aria-label="סגור">×</button>
              <h3 id="af-type-title" className="af-choice-title">בחירת סוג דיווח</h3>
              <button type="button" className="af-choice-icon-btn" onClick={() => setIsTypePickerOpen(false)} aria-label="חזרה">›</button>
            </div>

            <div className="af-choice-card" role="radiogroup" aria-label="סוג דיווח">
              {ABSENCE_TYPES.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={`af-choice-row ${draftType === option.value ? 'af-choice-row--selected' : ''}`}
                  role="radio"
                  aria-checked={draftType === option.value}
                  onClick={() => setDraftType(option.value)}
                >
                  <span className="af-choice-check" aria-hidden="true">{draftType === option.value ? '✓' : ''}</span>
                  <span className="af-choice-label">{option.label}</span>
                </button>
              ))}
            </div>

            <div className="af-choice-footer">
              <button type="button" className="af-btn-primary" onClick={applyType}>המשך</button>
              <button type="button" className="af-btn-secondary" onClick={() => setIsTypePickerOpen(false)}>ביטול</button>
            </div>
          </div>
        )}

        {showConflictModal && (
          <div className="af-choice-panel" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="af-conflict-title">
            <div className="af-choice-header">
              <button type="button" className="af-choice-icon-btn af-choice-icon-btn--close" onClick={cancelConflict} aria-label="סגור">×</button>
              <h3 id="af-conflict-title" className="af-choice-title">קיים דיווח שעות ביום זה. האם להחליף?</h3>
              <span />
            </div>
            <div className="af-choice-footer">
              <button type="button" className="af-btn-primary" onClick={replaceConflictingEntries}>החלף</button>
              <button type="button" className="af-btn-secondary" onClick={cancelConflict}>ביטול</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
