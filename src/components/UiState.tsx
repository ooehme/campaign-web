import { Link } from 'react-router-dom'

export function LoadingState() {
  return <p className="text-sm text-slate-600">Loading...</p>
}

export function EmptyState({ message }: { message: string }) {
  return <p className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">{message}</p>
}

type ErrorStateProps = {
  message: string
  title?: string
  description?: string
  actionLabel?: string
  actionTo?: string
}

export function ErrorState({ message, title, description, actionLabel, actionTo }: ErrorStateProps) {
  const hasContext = Boolean(title || description || (actionLabel && actionTo))

  if (!hasContext) {
    return <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>
  }

  return (
    <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <div className="space-y-1">
        {title && <h2 className="text-base font-semibold text-red-900">{title}</h2>}
        <p>{message}</p>
        {description && <p className="text-red-700">{description}</p>}
      </div>
      {actionLabel && actionTo && (
        <Link className="mt-3 inline-flex rounded border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100" to={actionTo}>
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

export const Unauthorized = () => <ErrorState message="You are not authenticated. Please log in." />

export const Forbidden = () => (
  <ErrorState
    title="Zugriff nicht erlaubt"
    message="Ihr Konto hat keine Berechtigung für diese Ansicht."
    description="Falls Sie die Seite benötigen, wenden Sie sich an eine Person mit Administrationsrechten."
    actionLabel="Zurück zum Dashboard"
    actionTo="/dashboard"
  />
)

export const NotFound = () => <ErrorState message="Requested resource was not found." />

export function ValidationErrors({ errors }: { errors: Record<string, string[]> }) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      {Object.entries(errors).map(([key, value]) => (
        <p key={key}>
          <strong>{key}:</strong> {value.join(', ')}
        </p>
      ))}
    </div>
  )
}

export const ServerError = () => <ErrorState message="Server error. Please retry shortly." />

export const GenericApiError = ({ message }: { message: string }) => <ErrorState message={message} />
