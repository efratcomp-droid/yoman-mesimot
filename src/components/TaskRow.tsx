import { buildGoogleCalendarUrl } from '../lib/calendarLink'
import { formatDueMeta } from '../lib/formatDate'
import type { Task } from '../types/database'
import CalendarIcon from './CalendarIcon'

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum'

const PRIORITY_BAR_COLOR: Record<Task['priority'], string> = {
  1: '#C15F86',
  2: '#C98A2E',
  3: '#A79BAA',
}
const DONE_BAR_COLOR = '#C9BFCB'

interface TaskRowProps {
  task: Task
  today: string
  categoryName: string
  onToggleDone: (id: string, done: boolean) => void
  onDelete: (id: string) => void
  onEdit: (id: string) => void
}

function TaskRow({
  task,
  today,
  categoryName,
  onToggleDone,
  onDelete,
  onEdit,
}: TaskRowProps) {
  const due = formatDueMeta(task.due_date, task.done, today)
  const barColor = task.done ? DONE_BAR_COLOR : PRIORITY_BAR_COLOR[task.priority]

  // Hidden rather than disabled on a done or undated task: the row is a
  // two-second glance, and a dead control on it costs more than it gives.
  const calendarUrl =
    task.due_date && !task.done
      ? buildGoogleCalendarUrl({
          title: task.title,
          dueDate: task.due_date,
          notes: task.notes,
          // Matches the edit panel, which sends no category line at all
          // rather than the "ללא קטגוריה" placeholder shown in the row.
          categoryName: task.category_id ? categoryName : null,
          priority: task.priority,
        })
      : null

  return (
    <div
      className={`mb-2 flex items-center gap-2.5 rounded-xl border px-3 py-[11px] ${
        task.done ? 'border-dashed border-line bg-transparent' : 'border-line bg-card'
      }`}
    >
      <button
        type="button"
        aria-label={task.done ? 'ביטול סימון' : 'סימון כבוצע'}
        onClick={() => onToggleDone(task.id, !task.done)}
        className={`flex min-h-11 min-w-11 flex-none items-center justify-center ${FOCUS_RING}`}
      >
        <span
          className={`flex h-[23px] w-[23px] items-center justify-center rounded-[7px] border-[1.8px] text-[13px] font-semibold text-white ${
            task.done ? 'border-sage bg-sage' : 'border-muted bg-transparent'
          }`}
        >
          {task.done ? '✓' : ''}
        </span>
      </button>

      <span
        className="min-h-[30px] w-1 flex-none self-stretch rounded-full"
        style={{ background: barColor }}
      />

      <button
        type="button"
        onClick={() => onEdit(task.id)}
        className={`flex min-h-11 min-w-0 flex-1 flex-col justify-center text-start ${FOCUS_RING}`}
      >
        <span
          className={`text-[15px] break-words ${task.done ? 'text-muted line-through' : ''}`}
        >
          {task.title}
        </span>
        <span className="mt-0.5 text-[12.5px] text-muted">
          {categoryName} ·{' '}
          <span className={due.isLate ? 'font-semibold text-[#B3374D]' : ''}>
            {due.text}
          </span>
        </span>
      </button>

      {calendarUrl && (
        <a
          href={calendarUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="הוספה ליומן"
          // The row's own controls sit beside this link rather than wrapping
          // it, but stopping here keeps the link inert to any future
          // click handler placed on the row itself.
          onClick={(event) => event.stopPropagation()}
          className={`flex min-h-11 min-w-11 flex-none items-center justify-center text-muted hover:text-plum ${FOCUS_RING}`}
        >
          <CalendarIcon size={17} />
        </a>
      )}

      <button
        type="button"
        aria-label="מחיקה"
        onClick={() => onDelete(task.id)}
        className={`flex min-h-11 min-w-11 flex-none items-center justify-center text-[17px] text-[#B0A3B4] ${FOCUS_RING}`}
      >
        ✕
      </button>
    </div>
  )
}

export default TaskRow
