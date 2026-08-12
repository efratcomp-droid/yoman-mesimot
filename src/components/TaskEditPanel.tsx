import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Category, Priority, Task } from '../types/database'

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum'

const FIELD_CLASS = `min-h-11 w-full rounded-[11px] border border-line bg-cream px-[13px] py-[11px] text-plum outline-none ${FOCUS_RING}`

const PRIORITY_LABEL: Record<Priority, string> = {
  1: 'דחוף',
  2: 'רגיל',
  3: 'נמוך',
}

type TaskChanges = Partial<
  Pick<Task, 'title' | 'notes' | 'category_id' | 'priority' | 'due_date'>
>

interface TaskEditPanelProps {
  task: Task
  categories: Category[]
  onUpdate: (id: string, changes: TaskChanges) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const CLOSE_DRAG_THRESHOLD = 80

function TaskEditPanel({
  task,
  categories,
  onUpdate,
  onDelete,
  onClose,
}: TaskEditPanelProps) {
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [dragY, setDragY] = useState(0)
  const dragStartY = useRef<number | null>(null)
  const dragYRef = useRef(0)
  const titleRef = useRef(title)
  const notesRef = useRef(notes)

  useEffect(() => {
    titleRef.current = title
  }, [title])
  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    if (title === task.title) {
      return
    }
    const timeout = setTimeout(() => {
      const trimmed = title.trim()
      if (trimmed) {
        onUpdate(task.id, { title: trimmed })
      }
    }, 500)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title])

  useEffect(() => {
    if (notes === task.notes) {
      return
    }
    const timeout = setTimeout(() => {
      onUpdate(task.id, { notes })
    }, 500)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes])

  // Flushes any edit still pending in the 500ms debounce when the panel closes.
  useEffect(() => {
    return () => {
      if (titleRef.current !== task.title) {
        const trimmed = titleRef.current.trim()
        if (trimmed) {
          onUpdate(task.id, { title: trimmed })
        }
      }
      if (notesRef.current !== task.notes) {
        onUpdate(task.id, { notes: notesRef.current })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStartY.current = event.clientY
    // Without capture the pointer leaves the small handle mid-drag and the
    // move events stop arriving, stranding the sheet part-way down.
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) {
      return
    }
    const delta = event.clientY - dragStartY.current
    if (delta > 0) {
      dragYRef.current = delta
      setDragY(delta)
    }
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) {
      return
    }
    dragStartY.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    const delta = dragYRef.current
    dragYRef.current = 0
    if (delta > CLOSE_DRAG_THRESHOLD) {
      onClose()
      return
    }
    setDragY(0)
  }

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="עריכת משימה"
        className="absolute inset-x-0 bottom-0 z-50 mx-auto max-h-[85vh] w-full max-w-[560px] overflow-y-auto rounded-t-2xl bg-card pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragY === 0 ? 'transform 150ms ease' : 'none',
        }}
      >
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="flex cursor-grab touch-none flex-col items-center pt-2 pb-1"
        >
          <span className="h-1 w-9 rounded-full bg-line" />
        </div>

        <div className="flex items-center justify-between px-4 pb-3">
          <h2 className="m-0 font-heading text-lg font-bold text-plum">עריכת משימה</h2>
          <button
            type="button"
            aria-label="סגירה"
            onClick={onClose}
            className={`flex min-h-11 min-w-11 items-center justify-center text-lg text-muted ${FOCUS_RING}`}
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 px-4 pb-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-plum">כותרת</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-plum">הערות</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className={FIELD_CLASS}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-plum">קטגוריה</span>
            <select
              value={task.category_id ?? ''}
              onChange={(event) =>
                onUpdate(task.id, { category_id: event.target.value || null })
              }
              className={FIELD_CLASS}
            >
              <option value="">ללא קטגוריה</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-plum">עדיפות</span>
            <select
              value={task.priority}
              onChange={(event) =>
                onUpdate(task.id, { priority: Number(event.target.value) as Priority })
              }
              className={FIELD_CLASS}
            >
              {([1, 2, 3] as const).map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABEL[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-plum">תאריך יעד</span>
            <input
              type="date"
              value={task.due_date ?? ''}
              onChange={(event) =>
                onUpdate(task.id, { due_date: event.target.value || null })
              }
              className={FIELD_CLASS}
            />
          </label>

          <div className="border-t border-line pt-4">
            {!confirmingDelete ? (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className={`flex min-h-11 w-full items-center justify-center rounded-[11px] text-rose ${FOCUS_RING}`}
              >
                מחיקת משימה
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-center text-sm text-muted">
                  למחוק את המשימה? הפעולה בלתי הפיכה.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(task.id)
                      onClose()
                    }}
                    className={`min-h-11 flex-1 rounded-[11px] bg-rose font-medium text-white ${FOCUS_RING}`}
                  >
                    מחיקה
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className={`min-h-11 flex-1 rounded-[11px] border border-line text-plum ${FOCUS_RING}`}
                  >
                    ביטול
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TaskEditPanel
