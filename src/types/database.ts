export type Priority = 1 | 2 | 3

export type Category = {
  id: string
  user_id: string
  name: string
  color: string
  position: number
}

export type Task = {
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

export type CategoryInsert = {
  id?: string
  user_id: string
  name: string
  color?: string
  position?: number
}

export type CategoryUpdate = {
  id?: string
  user_id?: string
  name?: string
  color?: string
  position?: number
}

export type TaskInsert = {
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

export type TaskUpdate = {
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

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: Category
        Insert: CategoryInsert
        Update: CategoryUpdate
        Relationships: []
      }
      tasks: {
        Row: Task
        Insert: TaskInsert
        Update: TaskUpdate
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
