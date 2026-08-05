export type Priority = 1 | 2 | 3

export interface Category {
  id: string
  user_id: string
  name: string
  color: string
  position: number
}

export interface Task {
  id: string
  user_id: string
  title: string
  notes: string
  category_id: string | null
  priority: Priority
  due_date: string | null
  done: boolean
  done_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface CategoryInsert {
  id?: string
  user_id: string
  name: string
  color?: string
  position?: number
}

export interface CategoryUpdate {
  id?: string
  user_id?: string
  name?: string
  color?: string
  position?: number
}

export interface TaskInsert {
  id?: string
  user_id: string
  title: string
  notes?: string
  category_id?: string | null
  priority?: Priority
  due_date?: string | null
  done?: boolean
  done_at?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export interface TaskUpdate {
  id?: string
  user_id?: string
  title?: string
  notes?: string
  category_id?: string | null
  priority?: Priority
  due_date?: string | null
  done?: boolean
  done_at?: string | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: Category
        Insert: CategoryInsert
        Update: CategoryUpdate
      }
      tasks: {
        Row: Task
        Insert: TaskInsert
        Update: TaskUpdate
      }
    }
  }
}
