import { useState, type FormEvent } from 'react'
import type { AddTaskInput } from '../store/tasks'
import type { Category, Priority } from '../types/database'
import type { SyncStatus } from '../store/tasks'
import ErrorBanner from './ErrorBanner'

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum'

const SYNC_LABEL: Record<SyncStatus, string> = {
  synced: 'מסונכרן',
  syncing: 'מסנכרן…',
  offline: 'אין חיבור',
  error: 'השמירה נכשלה',
}

// The indicator sits on every screen, so it is the one thing that must never
// claim everything is fine while a change is stuck.
const SYNC_COLOR: Record<SyncStatus, string> = {
  synced: 'text-muted',
  syncing: 'text-muted',
  offline: 'text-muted',
  error: 'text-rose font-medium',
}

const PRIORITY_LABEL: Record<Priority, string> = {
  1: 'דחוף',
  2: 'רגיל',
  3: 'נמוך',
}

interface QuickAddBarProps {
  categories: Category[]
  syncStatus: SyncStatus
  error: string | null
  onDismissError: () => void
  onAdd: (input: AddTaskInput) => void
}

function QuickAddBar({
  categories,
  syncStatus,
  error,
  onDismissError,
  onAdd,
}: QuickAddBarProps) {
  const [title, setTitle] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState<Priority>(2)
  const [dueDate, setDueDate] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      return
    }

    onAdd({
      title: trimmed,
      categoryId: categoryId || null,
      priority,
      dueDate: dueDate || null,
    })

    setTitle('')
    setCategoryId('')
    setPriority(2)
    setDueDate('')
    setShowMore(false)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-line bg-[rgba(251,247,243,0.94)] px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] backdrop-blur-[8px]">
      <div className="mx-auto max-w-[560px]">
        <ErrorBanner message={error} onDismiss={onDismissError} />

        <p className={`pb-3.5 text-center text-[12.5px] ${SYNC_COLOR[syncStatus]}`}>
          {SYNC_LABEL[syncStatus]}
        </p>

        <form className="flex items-center gap-2" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="הוספת משימה חדשה…"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={`min-h-11 min-w-0 flex-1 rounded-[11px] border border-line bg-card px-[13px] py-[11px] text-plum outline-none ${FOCUS_RING}`}
          />
          <button
            type="submit"
            aria-label="הוספה"
            className={`flex h-11 w-[46px] flex-none items-center justify-center rounded-[11px] bg-plum text-[21px] text-white ${FOCUS_RING}`}
          >
            +
          </button>
        </form>

        <button
          type="button"
          onClick={() => setShowMore((value) => !value)}
          className={`flex min-h-11 items-center text-[13px] text-muted ${FOCUS_RING}`}
        >
          פרטים נוספים {showMore ? '▴' : '▾'}
        </button>

        {showMore && (
          <div className="flex flex-wrap gap-2 pb-2">
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className={`min-h-11 flex-1 rounded-[11px] border border-line bg-card px-[13px] text-plum ${FOCUS_RING}`}
            >
              <option value="">ללא קטגוריה</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <select
              value={priority}
              onChange={(event) => setPriority(Number(event.target.value) as Priority)}
              className={`min-h-11 flex-1 rounded-[11px] border border-line bg-card px-[13px] text-plum ${FOCUS_RING}`}
            >
              {([1, 2, 3] as const).map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABEL[value]}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className={`min-h-11 flex-1 rounded-[11px] border border-line bg-card px-[13px] text-plum ${FOCUS_RING}`}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default QuickAddBar
