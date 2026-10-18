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
-- הרשאות טבלה — RLS לבדו אינו מספיק
-- ============================================================
-- Postgres בודק קודם אם לתפקיד יש הרשאה על הטבלה, ורק אחר כך מפעיל את ה-RLS
-- כדי לסנן שורות. בלי ה-grant הזה כל בקשה מהדפדפן נדחית ב-403
-- (permission denied for table) עוד לפני שה-policy נבדק — הטבלה נשארת ריקה
-- גם כשה-policies מוגדרים נכון לחלוטין.
--
-- anon אינו מקבל דבר: אין הרשמה פתוחה, והאפליקציה ניגשת לנתונים רק אחרי
-- התחברות, כלומר תמיד בתפקיד authenticated.

revoke all on table tasks from anon;
revoke all on table categories from anon;

grant select, insert, update, delete on table tasks to authenticated;
grant select, insert, update, delete on table categories to authenticated;

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

-- ============================================================
-- Realtime — הוספת tasks ל-publication
-- ============================================================
-- Realtime לא שולח דבר על טבלה שאינה ב-publication. בלי השורה הזו המנוי
-- בצד הלקוח מתחבר בהצלחה ולא מקבל אף אירוע, ובפרט לא את ה-UPDATE שנושא
-- מחיקה רכה — כך שמחיקה במכשיר אחד לא מגיעה לשני.
--
-- מחיקה רכה היא UPDATE ולא DELETE, ולכן די ב-replica identity הרגיל:
-- ה-handler קורא את payload.new, שמכיל תמיד את כל העמודות.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end
$$;

-- ============================================================
-- keep_alive() — שמירה על הפרויקט פעיל
-- ============================================================
-- בתוכנית החינמית פרויקט שלא מקבל פניות במשך כשבוע מושהה אוטומטית.
-- הפנייה היומית ל-/auth/v1/health הגיעה ל-GoTrue ולא הריצה שאילתת SQL,
-- ולכן לא איפסה את מונה חוסר הפעילות — והפרויקט הושהה למרות workflow ירוק.
-- הפונקציה הזו נותנת ל-ping נקודת REST אמיתית: קריאה אליה דרך PostgREST
-- מריצה שאילתה בפוסטגרס עצמו.
--
-- היא לא חושפת נתונים ולא כותבת דבר:
--   * אין פרמטרים ואין גישה לטבלאות — הגוף כולו הוא select now().
--   * stable, ולכן אסורה בה כל כתיבה.
--   * security invoker (ולא definer): היא רצה בהרשאות של הקורא, ול-anon
--     נשללו כל ההרשאות על tasks ועל categories למעלה בקובץ הזה.
--   * search_path ריק, כדי שלא ניתן להחליף את מה שהיא קוראת.

create or replace function public.keep_alive()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now();
$$;

comment on function public.keep_alive() is
  'מחזירה now(). נקראת פעם ביום מ-.github/workflows/keep-supabase-awake.yml כדי שהפרויקט לא יושהה בגלל חוסר פעילות. לא חושפת נתונים ולא כותבת דבר.';

-- הרשאת EXECUTE על פונקציה חדשה ניתנת ל-PUBLIC כברירת מחדל. השלילה
-- וה-grant המפורש משאירים אותה בדיוק אצל מי שצריך אותה.
revoke all on function public.keep_alive() from public;
grant execute on function public.keep_alive() to anon, authenticated;
