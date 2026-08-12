import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuthStore } from '../store/authStore'
import { useCategoriesStore } from '../store/categories'
import type { Category } from '../types/database'
import packageJson from '../../package.json'

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum'

interface CategoryRowProps {
  category: Category
  onRename: (id: string, name: string) => void
  onRecolor: (id: string, color: string) => void
  onDelete: (id: string) => void
}

function CategoryRow({ category, onRename, onRecolor, onDelete }: CategoryRowProps) {
  const [name, setName] = useState(category.name)
  const nameRef = useRef(name)

  useEffect(() => {
    nameRef.current = name
  }, [name])

  useEffect(() => {
    if (name === category.name) {
      return
    }
    const timeout = setTimeout(() => {
      const trimmed = name.trim()
      if (trimmed) {
        onRename(category.id, trimmed)
      }
    }, 500)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  useEffect(() => {
    return () => {
      if (nameRef.current !== category.name) {
        const trimmed = nameRef.current.trim()
        if (trimmed) {
          onRename(category.id, trimmed)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={category.color}
        onChange={(event) => onRecolor(category.id, event.target.value)}
        aria-label={`צבע עבור ${category.name}`}
        className="h-11 w-11 flex-none cursor-pointer rounded-full border border-line bg-card p-1"
      />
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={`min-h-11 flex-1 rounded-[11px] border border-line bg-cream px-[13px] text-plum outline-none ${FOCUS_RING}`}
      />
      <button
        type="button"
        aria-label={`מחיקת קטגוריית ${category.name}`}
        onClick={() => onDelete(category.id)}
        className={`flex min-h-11 min-w-11 flex-none items-center justify-center text-[17px] text-[#B0A3B4] ${FOCUS_RING}`}
      >
        ✕
      </button>
    </div>
  )
}

interface SettingsScreenProps {
  onBack: () => void
}

function SettingsScreen({ onBack }: SettingsScreenProps) {
  const signOut = useAuthStore((state) => state.signOut)
  const categories = useCategoriesStore((state) => state.categories)
  const load = useCategoriesStore((state) => state.load)
  const addCategory = useCategoriesStore((state) => state.addCategory)
  const renameCategory = useCategoriesStore((state) => state.renameCategory)
  const recolorCategory = useCategoriesStore((state) => state.recolorCategory)
  const deleteCategory = useCategoriesStore((state) => state.deleteCategory)

  const [newCategoryName, setNewCategoryName] = useState('')

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onBack()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onBack])

  const handleAddCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = newCategoryName.trim()
    if (!trimmed) {
      return
    }
    void addCategory(trimmed)
    setNewCategoryName('')
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-[560px] px-4 pt-[18px] pb-10">
        <div className="mb-[18px] flex items-center gap-3">
          <button
            type="button"
            aria-label="חזרה למסך הראשי"
            onClick={onBack}
            className={`flex h-11 w-11 flex-none items-center justify-center rounded-full bg-lilac text-[17px] text-plum ${FOCUS_RING}`}
          >
            →
          </button>
          <h1 className="m-0 font-heading text-[22px] font-bold text-[#2B1D2E]">
            הגדרות
          </h1>
        </div>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-muted">קטגוריות</h2>

          <div className="flex flex-col gap-2">
            {categories.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                onRename={renameCategory}
                onRecolor={recolorCategory}
                onDelete={deleteCategory}
              />
            ))}
          </div>

          <form className="mt-3 flex items-center gap-2" onSubmit={handleAddCategory}>
            <input
              type="text"
              placeholder="קטגוריה חדשה…"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              className={`min-h-11 min-w-0 flex-1 rounded-[11px] border border-line bg-card px-[13px] text-plum outline-none ${FOCUS_RING}`}
            />
            <button
              type="submit"
              aria-label="הוספת קטגוריה"
              className={`flex h-11 w-[46px] flex-none items-center justify-center rounded-[11px] bg-plum text-[21px] text-white ${FOCUS_RING}`}
            >
              +
            </button>
          </form>
        </section>

        <section className="mb-8">
          <button
            type="button"
            onClick={() => void signOut()}
            className={`min-h-11 w-full rounded-[11px] border border-line bg-card font-medium text-plum ${FOCUS_RING}`}
          >
            יציאה מהחשבון
          </button>
        </section>

        <p className="text-center text-[12.5px] text-muted">גרסה {packageJson.version}</p>
      </div>
    </div>
  )
}

export default SettingsScreen
