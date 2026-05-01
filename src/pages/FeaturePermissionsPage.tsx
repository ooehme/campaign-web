import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { getFeaturePermissions, updateFeaturePermissions } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { FeaturePermissionMatrixResponse, FeaturePermissionMatrixRow, FeaturePermissionUpdatePayload } from '../types/models'
import { canFlag, NO_PERMISSION_MESSAGE } from '../utils/permissions'

const toReadableError = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Keine Berechtigung für diese Aktion.'
    if (error.status === 422) {
      const details = error.details as { message?: string; errors?: Record<string, string[] | string> } | undefined
      if (details?.errors) {
        const lines = Object.values(details.errors).flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
        if (lines.length > 0) return `Validierungsfehler: ${lines.join(' | ')}`
      }
      return details?.message ?? 'Validierungsfehler beim Speichern.'
    }
    if (error.status >= 500) return 'Serverfehler beim Laden oder Speichern.'
  }
  return (error as Error)?.message ?? 'Unbekannter Fehler.'
}

const cloneMatrix = (matrix: FeaturePermissionMatrixResponse): FeaturePermissionMatrixResponse => ({
  ...matrix,
  features: matrix.features.map((feature) => ({ ...feature })),
  roles: matrix.roles.map((role) => ({ ...role })),
  matrix: matrix.matrix.map((row) => ({ ...row })),
})

const matrixKey = (row: Pick<FeaturePermissionMatrixRow, 'role_id' | 'feature_key'>): string => `${row.role_id}::${row.feature_key}`

export function FeaturePermissionsPage() {
  const queryClient = useQueryClient()
  const { user, refreshUser } = useAuth()
  const [localMatrix, setLocalMatrix] = useState<FeaturePermissionMatrixResponse | null>(null)
  const [serverMatrix, setServerMatrix] = useState<FeaturePermissionMatrixResponse | null>(null)

  const matrixQuery = useQuery({ queryKey: ['feature-permissions'], queryFn: getFeaturePermissions, retry: false })

  useEffect(() => {
    if (!matrixQuery.data) return
    const snapshot = cloneMatrix(matrixQuery.data)
    setServerMatrix(snapshot)
    setLocalMatrix(cloneMatrix(snapshot))
  }, [matrixQuery.data])

  const canManage = user?.app_role === 'admin' || canFlag(user?.can, 'manage_feature_permissions')

  const mutation = useMutation({
    mutationFn: (payload: FeaturePermissionUpdatePayload) => updateFeaturePermissions(payload),
    onSuccess: async (response) => {
      const snapshot = cloneMatrix(response)
      setServerMatrix(snapshot)
      setLocalMatrix(cloneMatrix(snapshot))
      await queryClient.invalidateQueries({ queryKey: ['feature-permissions'] })
      await refreshUser()
    },
  })

  const dirty = useMemo(() => {
    if (!localMatrix || !serverMatrix) return false
    const current = new Map(localMatrix.matrix.map((row) => [matrixKey(row), row]))
    const original = new Map(serverMatrix.matrix.map((row) => [matrixKey(row), row]))
    if (current.size !== original.size) return true
    for (const [key, row] of current) {
      const source = original.get(key)
      if (!source) return true
      if (source.can_view !== row.can_view || source.can_use !== row.can_use || source.can_manage_feature_permissions !== row.can_manage_feature_permissions) return true
    }
    return false
  }, [localMatrix, serverMatrix])

  const selfLockoutWarning = useMemo(() => {
    if (!localMatrix || !serverMatrix || !dirty) return null
    const managesPermissionFlagTouched = localMatrix.matrix.some((row) => typeof row.can_manage_feature_permissions === 'boolean')
    if (!managesPermissionFlagTouched) return null

    // Backend response does not always include current user's role linkage.
    // Therefore we show a generic warning whenever manage-permission flags are edited.
    return 'Warnung: Änderungen an Verwaltungsrechten können Ihren eigenen Zugriff auf diese Seite entfernen.'
  }, [dirty, localMatrix, serverMatrix])

  if (matrixQuery.isLoading) return <LoadingState />
  if (matrixQuery.isError) return <ErrorState message={toReadableError(matrixQuery.error)} />
  if (!localMatrix || localMatrix.features.length === 0 || localMatrix.roles.length === 0) return <EmptyState message='Keine Feature-Berechtigungen vorhanden.' />

  const toggle = (roleId: number, featureKey: string, type: 'can_view' | 'can_use') => {
    setLocalMatrix((prev) => {
      if (!prev) return prev
      const index = prev.matrix.findIndex((row) => row.role_id === roleId && row.feature_key === featureKey)
      if (index < 0) return prev
      const nextRows = prev.matrix.map((row) => ({ ...row }))
      nextRows[index][type] = !nextRows[index][type]
      return { ...prev, matrix: nextRows }
    })
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Feature-Berechtigungen</h1>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
            disabled={!dirty || mutation.isPending}
            onClick={() => setLocalMatrix(serverMatrix ? cloneMatrix(serverMatrix) : null)}
          >
            Zurücksetzen
          </button>
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={!canManage || !dirty || mutation.isPending}
            title={!canManage ? NO_PERMISSION_MESSAGE : undefined}
            onClick={() => localMatrix && mutation.mutate({ matrix: localMatrix.matrix })}
          >
            Speichern
          </button>
        </div>
      </div>

      {!canManage && <ErrorState message="Keine Berechtigung für diese Aktion." />}
      {selfLockoutWarning && <div className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-800">{selfLockoutWarning}</div>}
      {mutation.isError && <ErrorState message={toReadableError(mutation.error)} />}
      {mutation.isSuccess && <p className="text-sm text-emerald-700">Berechtigungen gespeichert.</p>}

      <div className="overflow-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left">
              <th className="p-2">Feature</th>
              {localMatrix.roles.map((role) => (
                <th key={role.id} className="p-2">{role.label ?? role.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {localMatrix.features.map((feature) => (
              <tr key={feature.key} className="border-b align-top">
                <td className="p-2">
                  <p className="font-medium">{feature.label ?? feature.key}</p>
                  <p className="text-xs text-slate-500">{feature.description ?? feature.key}</p>
                </td>
                {localMatrix.roles.map((role) => {
                  const cell = localMatrix.matrix.find((entry) => entry.role_id === role.id && entry.feature_key === feature.key)
                  if (!cell) return <td key={role.id} className="p-2 text-slate-400">–</td>

                  return (
                    <td key={role.id} className="p-2">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          aria-label={`${role.label ?? role.name} / ${feature.label ?? feature.key} Sichtbar`}
                          type="checkbox"
                          checked={cell.can_view}
                          disabled={!canManage || mutation.isPending}
                          onChange={() => toggle(role.id, feature.key, 'can_view')}
                        />
                        Sichtbar
                      </label>
                      <label className="mt-1 flex items-center gap-2 text-xs">
                        <input
                          aria-label={`${role.label ?? role.name} / ${feature.label ?? feature.key} Bedienbar`}
                          type="checkbox"
                          checked={cell.can_use}
                          disabled={!canManage || mutation.isPending}
                          onChange={() => toggle(role.id, feature.key, 'can_use')}
                        />
                        Bedienbar
                      </label>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
