import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { getFeaturePermissions, updateFeaturePermissions } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { RolePermissionMatrixResponse, RolePermissionUpdatePayload } from '../types/models'
import { PERMISSIONS } from '../utils/permissionKeys'
import { hasPermission, NO_PERMISSION_MESSAGE } from '../utils/permissions'

const INVALID_MATRIX_MESSAGE = 'Die Berechtigungsmatrix konnte nicht gelesen werden.'
const MISSING_MATRIX_ROW_MESSAGE = 'Achtung: Für diese Rolle/Berechtigung fehlt ein Matrix-Eintrag vom Backend. Der Wert ist derzeit deaktiviert.'

const toReadableError = (error: unknown): string => {
  if (error instanceof ApiError && error.status === 403) return NO_PERMISSION_MESSAGE
  if (error instanceof ApiError && error.status === 422) {
    const details =
      error.details && typeof error.details === 'object' && 'errors' in error.details
        ? (error.details as { errors?: Record<string, string[] | string> }).errors
        : undefined
    const flat = details
      ? Object.values(details)
          .flatMap((value) => (Array.isArray(value) ? value : [value]))
          .map((value) => String(value))
          .join(' · ')
      : ''
    return flat ? `Validierungsfehler: ${flat}` : 'Validierungsfehler (422) beim Speichern der Berechtigungen.'
  }
  return (error as Error)?.message ?? 'Unbekannter Fehler.'
}

const cloneMatrix = (matrix: RolePermissionMatrixResponse): RolePermissionMatrixResponse => ({
  permissions: matrix.permissions.map((permission) => ({ ...permission })),
  roles: matrix.roles.map((role) => ({ ...role })),
  matrix: matrix.matrix.map((row) => ({ ...row })),
})

const matrixKey = (row: { role_key: string; permission_key: string }): string => `${row.role_key}:${row.permission_key}`
const isValidMatrixResponse = (value: RolePermissionMatrixResponse): boolean =>
  Array.isArray(value.permissions) && Array.isArray(value.roles) && Array.isArray(value.matrix)

export function FeaturePermissionsPage() {
  const queryClient = useQueryClient()
  const { user, refreshUser } = useAuth()
  const [localMatrix, setLocalMatrix] = useState<RolePermissionMatrixResponse | null>(null)
  const [serverMatrix, setServerMatrix] = useState<RolePermissionMatrixResponse | null>(null)

  const matrixQuery = useQuery({ queryKey: ['feature-permissions'], queryFn: getFeaturePermissions, retry: false })
  const canManage = hasPermission(user, PERMISSIONS.FEATURE_PERMISSIONS_MANAGE)

  useEffect(() => {
    if (!matrixQuery.data || !isValidMatrixResponse(matrixQuery.data)) return
    const snapshot = cloneMatrix(matrixQuery.data)
    setServerMatrix(snapshot)
    setLocalMatrix(cloneMatrix(snapshot))
  }, [matrixQuery.data])

  const mutation = useMutation({
    mutationFn: (payload: RolePermissionUpdatePayload) => updateFeaturePermissions(payload),
    onSuccess: async (response) => {
      const snapshot = cloneMatrix(response)
      setServerMatrix(snapshot)
      setLocalMatrix(cloneMatrix(snapshot))
      await queryClient.invalidateQueries({ queryKey: ['feature-permissions'] })
      await queryClient.invalidateQueries({ queryKey: ['auth', 'user'] })
      await refreshUser()
    },
  })

  const dirty = useMemo(() => {
    if (!localMatrix || !serverMatrix) return false
    return JSON.stringify(localMatrix.matrix) !== JSON.stringify(serverMatrix.matrix)
  }, [localMatrix, serverMatrix])

  if (matrixQuery.isLoading) return <LoadingState />
  if (matrixQuery.isError) return <ErrorState message={toReadableError(matrixQuery.error)} />
  if (matrixQuery.data && !isValidMatrixResponse(matrixQuery.data)) return <ErrorState message={INVALID_MATRIX_MESSAGE} />
  if (!localMatrix || localMatrix.permissions.length === 0 || localMatrix.roles.length === 0) {
    return <EmptyState message='Keine Berechtigungen vorhanden.' />
  }

  const matrixMap = new Map(localMatrix.matrix.map((row) => [matrixKey(row), row] as const))
  const hasMissingRows = localMatrix.permissions.some((permission) =>
    localMatrix.roles.some((role) => !matrixMap.has(`${role.key}:${permission.key}`)),
  )
  const adminManageRow = matrixMap.get(`app-admin:${PERMISSIONS.FEATURE_PERMISSIONS_MANAGE}`)
  const adminManageDisabled = adminManageRow?.enabled === false

  const toggle = (roleKey: string, permissionKey: string) => {
    setLocalMatrix((previous) => {
      if (!previous) return previous
      const key = `${roleKey}:${permissionKey}`
      if (!previous.matrix.some((row) => matrixKey(row) === key)) return previous
      return {
        ...previous,
        matrix: previous.matrix.map((row) =>
          matrixKey(row) === key
            ? {
                ...row,
                enabled: !row.enabled,
              }
            : row,
        ),
      }
    })
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-semibold">Feature-Rechte</h1>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={!dirty || mutation.isPending}
            onClick={() => {
              if (!serverMatrix) return
              setLocalMatrix(cloneMatrix(serverMatrix))
            }}
          >
            Zurücksetzen
          </button>
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={!canManage || !dirty || mutation.isPending}
            onClick={() => {
              if (!localMatrix) return
              mutation.mutate({ matrix: localMatrix.matrix })
            }}
          >
            Speichern
          </button>
        </div>
      </div>

      {!canManage && <ErrorState message={NO_PERMISSION_MESSAGE} />}
      {mutation.isError && <ErrorState message={toReadableError(mutation.error)} />}
      {hasMissingRows && <ErrorState message={MISSING_MATRIX_ROW_MESSAGE} />}
      {adminManageDisabled && (
        <ErrorState message="Warnung: app-admin ohne 'feature_permissions.manage' kann die Feature-Rechte nicht mehr verwalten." />
      )}

      <div className="overflow-auto rounded border bg-white">
        <table className="min-w-[760px] w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left">
              <th className="p-2">Berechtigung</th>
              {localMatrix.roles.map((role) => (
                <th key={role.key} className="p-2">
                  {role.label ?? role.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {localMatrix.permissions.map((permission) => (
              <tr key={permission.key} className="border-b">
                <td className="p-2">{permission.label ?? permission.key}</td>
                {localMatrix.roles.map((role) => {
                  const key = `${role.key}:${permission.key}`
                  const cell = matrixMap.get(key)
                  const missing = !cell
                  return (
                    <td key={key} className="p-2">
                      <label className="inline-flex min-h-10 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={cell?.enabled === true}
                          disabled={!canManage || missing}
                          onChange={() => toggle(role.key, permission.key)}
                        />
                        <span className={missing ? 'text-amber-700' : ''}>{missing ? 'Aktiv (fehlt)' : 'Aktiv'}</span>
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
