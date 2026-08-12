# יומן משימות

אפליקציית ניהול משימות אישית בעברית, לשימוש יומיומי מאייפון וממחשב.
עובדת גם בלי רשת, ומסתנכרנת בין המכשירים תוך שניות.

המפרט המלא של הפרויקט נמצא ב-[CLAUDE.md](./CLAUDE.md).

## טכנולוגיות

React 18 + TypeScript + Vite · Tailwind CSS (RTL) · Zustand · Supabase
(Postgres + Auth + Realtime + RLS) · PWA דרך vite-plugin-pwa · Vitest +
Testing Library.

אין שרת ביניים — הדפדפן מדבר ישירות עם Supabase.

## הרצה מקומית

```bash
npm install
cp .env.example .env.local   # ומלאי את הערכים מפרויקט ה-Supabase שלך
npm run dev
```

### משתני סביבה

| משתנה                    | תיאור                   |
| ------------------------ | ----------------------- |
| `VITE_SUPABASE_URL`      | כתובת פרויקט ה-Supabase |
| `VITE_SUPABASE_ANON_KEY` | מפתח ה-anon הציבורי     |

שני המשתנים ציבוריים מעצם הגדרתם, וההגנה על הנתונים נשענת כולה על RLS.
מפתח `service_role` לעולם לא נכנס לקוד הלקוח, ו-`.env.local` נשאר ב-`.gitignore`.

## פקודות

| פקודה             | פעולה                  |
| ----------------- | ---------------------- |
| `npm run dev`     | שרת פיתוח              |
| `npm run build`   | בנייה לייצור           |
| `npm run preview` | תצוגה מקדימה של הבנייה |
| `npm run lint`    | ESLint                 |
| `npm test`        | Vitest                 |
| `npm run format`  | Prettier               |

## מסד הנתונים

הסכימה נמצאת ב-[`supabase/schema.sql`](./supabase/schema.sql) — טבלאות, RLS,
אינדקסים, וטריגרים. הקובץ אידמפוטנטי וניתן להריץ אותו שוב על אותו מסד נתונים.

## פרסום

כל דחיפה ל-`main` מריצה את
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml), שמריץ בדיקות
איכות, בונה, ומפרסם ל-GitHub Pages.

לפני הפרסום הראשון צריך להוסיף ב-**Settings → Secrets and variables → Actions**
את `VITE_SUPABASE_URL` ואת `VITE_SUPABASE_ANON_KEY`. בלעדיהם ה-workflow נעצר
עם הודעה מפורשת, במקום לפרסם אפליקציה שנשברת רק כשפותחים אותה.

את GitHub Pages עצמו ה-workflow מפעיל לבד בהרצה הראשונה (`enablement: true`),
ולכן אין צורך להגדיר אותו ידנית. אם ההרצה נכשלת בשלב הזה בכל זאת, אפשר לבחור
ב-**Settings → Pages → Source** את **GitHub Actions**.

האתר מתפרסם תחת `/yoman-mesimot/`, ולכן `base` ב-`vite.config.ts` מוגדר לנתיב
הזה. אם שם המאגר משתנה — צריך לעדכן גם אותו.
