import type { AuthError } from '@supabase/supabase-js'

const messagesByCode: Record<string, string> = {
  invalid_credentials: 'אימייל או סיסמה שגויים.',
  email_not_confirmed: 'יש לאשר את כתובת האימייל לפני ההתחברות.',
  user_not_found: 'לא נמצא חשבון עם הפרטים האלה.',
  user_banned: 'החשבון חסום. יש לפנות לבעלת המערכת.',
  over_request_rate_limit: 'יותר מדי ניסיונות התחברות. נסי שוב בעוד כמה דקות.',
  over_email_send_rate_limit: 'יותר מדי בקשות. נסי שוב בעוד כמה דקות.',
  request_timeout: 'הבקשה ארכה זמן רב מדי. בדקי את החיבור לאינטרנט ונסי שוב.',
}

export function toHebrewAuthError(error: AuthError): string {
  const known = error.code ? messagesByCode[error.code] : undefined
  if (known) {
    return known
  }

  if (!error.status) {
    return 'אין חיבור לשרת. בדקי את החיבור לאינטרנט ונסי שוב.'
  }

  return 'אירעה שגיאה בהתחברות. נסי שוב.'
}
