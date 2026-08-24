const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum'

interface ErrorBannerProps {
  message: string | null
  onDismiss: () => void
}

/** A write that failed must never be silent — this is where the reason lands. */
function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) {
    return null
  }

  return (
    <div
      role="alert"
      className="mb-2.5 flex items-start gap-2 rounded-xl border border-rose bg-[#FBEAF0] px-3 py-2.5"
    >
      <p className="m-0 flex-1 text-[13.5px] leading-snug text-[#72243E]">{message}</p>
      <button
        type="button"
        aria-label="סגירת ההודעה"
        onClick={onDismiss}
        className={`flex min-h-11 min-w-11 flex-none items-center justify-center text-[15px] text-[#993556] ${FOCUS_RING}`}
      >
        ✕
      </button>
    </div>
  )
}

export default ErrorBanner
