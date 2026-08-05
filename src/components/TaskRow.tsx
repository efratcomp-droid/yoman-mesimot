import { formatDueMeta } from '../lib/formatDate'
import type { Task } from '../types/database'

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
}

function TaskRow({ task, today, categoryName, onToggleDone, onDelete }: TaskRowProps) {
  const due = formatDueMeta(task.due_date, task.done, today)
  const barColor = task.done ? DONE_BAR_COLOR : PRIORITY_BAR_COLOR[task.priority]

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

      <div className="min-w-0 flex-1">
        <p
          className={`m-0 text-[15px] break-words ${task.done ? 'text-muted line-through' : ''}`}
        >
          {task.title}
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {categoryName} ·{' '}
          <span className={due.isLate ? 'font-semibold text-[#B3374D]' : ''}>
            {due.text}
          </span>
        </p>
      </div>

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
