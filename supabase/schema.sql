-- יומן משימות — סכימת מסד נתונים
-- ריצה חד-פעמית על מסד נתונים ריק. הקובץ נבנה כך שאפשר להריץ אותו שוב
-- בלי שגיאות (create if not exists, create or replace, drop ... if exists).

create extension if not exists pgcrypto;

-- ============================================================
-- טבלאות
-- ============================================================

create table if not exists categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null default '#4A2C52',
  position   smallint not null default 0
);

create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  notes        text default '',
  category_id  uuid references categories(id) on delete set null,
  priority     smallint not null default 2 check (priority between 1 and 3), -- 1 דחוף, 2 רגיל, 3 נמוך
  due_date     date,
  done         boolean not null default false,
  done_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ============================================================
-- אינדקסים
-- ============================================================

create index if not exists idx_categories_user_id on categories (user_id);
create index if not exists idx_tasks_user_id on tasks (user_id);
create index if not exists idx_tasks_due_date on tasks (due_date);
create index if not exists idx_tasks_done on tasks (done);

-- ============================================================
-- Row Level Security — policy נפרד לכל פעולה, על בסיס user_id = auth.uid()
-- ============================================================

alter table categories enable row level security;
alter table tasks enable row level security;

drop policy if exists categories_select_own on categories;
create policy categories_select_own on categories
  for select
  using (user_id = auth.uid());

drop policy if exists categories_insert_own on categories;
create policy categories_insert_own on categories
  for insert
  with check (user_id = auth.uid());

drop policy if exists categories_update_own on categories;
create policy categories_update_own on categories
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists categories_delete_own on categories;
create policy categories_delete_own on categories
  for delete
  using (user_id = auth.uid());

drop policy if exists tasks_select_own on tasks;
create policy tasks_select_own on tasks
  for select
  using (user_id = auth.uid());

drop policy if exists tasks_insert_own on tasks;
create policy tasks_insert_own on tasks
  for insert
  with check (user_id = auth.uid());

drop policy if exists tasks_update_own on tasks;
create policy tasks_update_own on tasks
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists tasks_delete_own on tasks;
create policy tasks_delete_own on tasks
  for delete
  using (user_id = auth.uid());

-- ============================================================
-- טריגר: עדכון updated_at אוטומטי בכל update על tasks
-- ============================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_tasks_updated_at on tasks;
create trigger set_tasks_updated_at
  before update on tasks
  for each row
  execute function set_updated_at();

-- ============================================================
-- טריגר: יצירת ארבע קטגוריות ברירת מחדל למשתמש חדש
-- ============================================================

create or replace function create_default_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, position) values
    (new.id, 'כספים', 0),
    (new.id, 'תפעול', 1),
    (new.id, 'הנהלה', 2),
    (new.id, 'אישי', 3);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function create_default_categories();
