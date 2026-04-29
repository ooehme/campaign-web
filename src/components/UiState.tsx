export function LoadingState() {
  return <p className="text-sm text-slate-600">Loading...</p>
}

export function EmptyState({ message }: { message: string }) {
  return <p className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">{message}</p>
}

export function ErrorState({ message }: { message: string }) {
  return <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>
}

export const Unauthorized = () => <ErrorState message="You are not authenticated. Please log in." />

export const Forbidden = () => <ErrorState message="You are not allowed to perform this action." />

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
