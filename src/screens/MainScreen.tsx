import { useEffect, useMemo, useState } from 'react'
import { useTasksStore } from '../store/tasks'
import { useCategoriesStore } from '../store/categories'
import { formatHeaderDate, toDateOnly } from '../lib/formatDate'
import { FILTERS, filterTasks, sortTasks, type FilterKey } from '../lib/taskFilters'
import TaskRow from '../components/TaskRow'
import QuickAddBar from '../components/QuickAddBar'
import TaskEditPanel from '../components/TaskEditPanel'

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum'

const EMPTY_MESSAGE: Record<FilterKey, string> = {
  today: 'אין משימות לתאריך של היום.',
  week: 'אין משימות השבוע. אפשר להוסיף אחת למטה.',
  all: 'אין משימות פתוחות. הוסיפי משימה חדשה למטה.',
  done: 'עוד לא הושלמה אף משימה.',
}

interface MainScreenProps {
  onOpenSettings: () => void
}

function MainScreen({ onOpenSettings }: MainScreenProps) {
  const tasks = useTasksStore((state) => state.tasks)
  const syncStatus = useTasksStore((state) => state.syncStatus)
  const load = useTasksStore((state) => state.load)
  const addTask = useTasksStore((state) => state.addTask)
  const updateTask = useTasksStore((state) => state.updateTask)
  const markDone = useTasksStore((state) => state.markDone)
  const softDeleteTask = useTasksStore((state) => state.softDeleteTask)
  const subscribeRealtime = useTasksStore((state) => state.subscribeRealtime)

  const categories = useCategoriesStore((state) => state.categories)
  const loadCategories = useCategoriesStore((state) => state.load)

  const [filter, setFilter] = useState<FilterKey>('today')
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const today = toDateOnly(new Date())

  useEffect(() => {
    void load()
    const unsubscribe = subscribeRealtime()
    return unsubscribe
  }, [load, subscribeRealtime])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const category of categories) {
      map.set(category.id, category.name)
    }
    return map
  }, [categories])

  const todayCount = filterTasks(tasks, 'today', today).length
  const openCount = filterTasks(tasks, 'all', today).length
  const doneCount = filterTasks(tasks, 'done', today).length

  const visibleTasks = sortTasks(filterTasks(tasks, filter, today), today)
  const editingTask = tasks.find((task) => task.id === editingTaskId) ?? null

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-[560px] px-4 pt-[18px] pb-[132px]">
        <div className="mb-[18px] flex items-start justify-between gap-3">
          <div>
            <h1 className="m-0 font-heading text-[27px] leading-[1.15] font-bold tracking-[-0.01em] text-[#2B1D2E]">
              יומן משימות
            </h1>
            <p className="mt-[3px] text-[13.5px] text-muted">
              {formatHeaderDate(new Date())}
            </p>
            <div className="mt-[9px] h-0.5 w-[34px] rounded-sm bg-rose" />
          </div>
          <button
            type="button"
            aria-label="הגדרות"
            onClick={onOpenSettings}
            className={`flex h-11 w-11 flex-none items-center justify-center rounded-full bg-lilac text-[17px] text-plum ${FOCUS_RING}`}
          >
            ⚙
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-[#FBEAF0] px-2 py-[11px] text-center">
            <b className="block font-heading text-[23px] leading-[1.1] font-bold text-[#993556]">
              {todayCount}
            </b>
            <span className="mt-px block text-[12.5px] text-[#72243E]">להיום</span>
          </div>
          <div className="rounded-xl bg-lilac px-2 py-[11px] text-center">
            <b className="block font-heading text-[23px] leading-[1.1] font-bold text-plum">
              {openCount}
            </b>
            <span className="mt-px block text-[12.5px] text-[#5B3A63]">פתוחות</span>
          </div>
          <div className="rounded-xl bg-[#E3F1EA] px-2 py-[11px] text-center">
            <b className="block font-heading text-[23px] leading-[1.1] font-bold text-[#276A52]">
              {doneCount}
            </b>
            <span className="mt-px block text-[12.5px] text-[#1E5240]">הושלמו</span>
          </div>
        </div>

        <div className="mb-3.5 flex gap-1.5 overflow-x-auto">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
              className={`flex min-h-11 flex-none items-center justify-center rounded-full border px-[15px] text-sm whitespace-nowrap ${FOCUS_RING} ${
                filter === option.key
                  ? 'border-plum bg-plum font-medium text-[#F6EFF6]'
                  : 'border-line bg-card text-muted'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {visibleTasks.length === 0 ? (
          <p className="py-6 text-center text-muted">{EMPTY_MESSAGE[filter]}</p>
        ) : (
          visibleTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              today={today}
              categoryName={categoryNameById.get(task.category_id ?? '') ?? 'ללא קטגוריה'}
              onToggleDone={markDone}
              onDelete={softDeleteTask}
              onEdit={setEditingTaskId}
            />
          ))
        )}
      </div>

      <QuickAddBar categories={categories} syncStatus={syncStatus} onAdd={addTask} />

      {editingTask && (
        <TaskEditPanel
          task={editingTask}
          categories={categories}
          onUpdate={updateTask}
          onDelete={softDeleteTask}
          onClose={() => setEditingTaskId(null)}
        />
      )}
    </div>
  )
}

export default MainScreen
