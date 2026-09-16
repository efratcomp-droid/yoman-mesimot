import { categoryTextOnTint, categoryTint, readableTextOn } from '../lib/categoryColor'
import { ALL_CATEGORIES, sortCategories } from '../lib/categoryFilter'
import type { Category } from '../types/database'

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum'

const CHIP =
  'flex min-h-11 flex-none items-center justify-center rounded-full border px-[15px] text-sm whitespace-nowrap'

interface CategoryFilterBarProps {
  categories: Category[]
  selectedCategoryId: string
  onSelect: (categoryId: string) => void
}

/** Hidden below two categories: a single chip filters nothing. */
function CategoryFilterBar({
  categories,
  selectedCategoryId,
  onSelect,
}: CategoryFilterBarProps) {
  if (categories.length < 2) {
    return null
  }

  const allSelected = selectedCategoryId === ALL_CATEGORIES

  return (
    <div
      role="group"
      aria-label="סינון לפי קטגוריה"
      className="mb-3.5 flex gap-1.5 overflow-x-auto"
    >
      <button
        type="button"
        aria-pressed={allSelected}
        onClick={() => onSelect(ALL_CATEGORIES)}
        className={`${CHIP} ${FOCUS_RING} ${
          allSelected
            ? 'border-plum bg-plum font-medium text-[#F6EFF6]'
            : 'border-line bg-card text-muted'
        }`}
      >
        כל הקטגוריות
      </button>

      {sortCategories(categories).map((category) => {
        const selected = category.id === selectedCategoryId
        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(category.id)}
            className={`${CHIP} ${FOCUS_RING} ${selected ? 'font-medium' : ''}`}
            style={
              selected
                ? {
                    backgroundColor: category.color,
                    borderColor: category.color,
                    color: readableTextOn(category.color),
                  }
                : {
                    backgroundColor: categoryTint(category.color),
                    borderColor: categoryTint(category.color, 0.4),
                    color: categoryTextOnTint(category.color),
                  }
            }
          >
            {category.name}
          </button>
        )
      })}
    </div>
  )
}

export default CategoryFilterBar
