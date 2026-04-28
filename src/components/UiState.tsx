export function LoadingState() {
  return <p className="text-sm text-slate-600">Loading...</p>
}

export function EmptyState({ message }: { message: string }) {
  return <p className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">{message}</p>
}

export function ErrorState({ message }: { message: string }) {
  return <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>
}
