import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { getFeaturePermissions, updateFeaturePermissions } from '../api/endpoints'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import type { FeaturePermissionUpdatePayload, RolePermissionMatrixResponse } from '../types/models'
import { PERMISSIONS } from '../utils/permissionKeys'
import { hasPermission, NO_PERMISSION_MESSAGE } from '../utils/permissions'

const INVALID_MATRIX_MESSAGE = 'Die Berechtigungsmatrix konnte nicht gelesen werden.'
const toReadableError = (error: unknown): string => (error instanceof ApiError && error.status === 403 ? NO_PERMISSION_MESSAGE : (error as Error)?.message ?? 'Unbekannter Fehler.')
const cloneMatrix = (matrix: RolePermissionMatrixResponse): RolePermissionMatrixResponse => ({ permissions: matrix.permissions.map((p) => ({ ...p })), roles: matrix.roles.map((r) => ({ ...r })), matrix: matrix.matrix.map((row) => ({ ...row })) })
const matrixKey = (row: { role_key: string; permission_key: string }): string => `${row.role_key}:${row.permission_key}`
const isValidMatrixResponse = (value: RolePermissionMatrixResponse): boolean => Array.isArray(value.permissions) && Array.isArray(value.roles) && Array.isArray(value.matrix)

export function FeaturePermissionsPage() {
  const queryClient = useQueryClient()
  const { user, refreshUser } = useAuth()
  const [localMatrix, setLocalMatrix] = useState<RolePermissionMatrixResponse | null>(null)
  const [serverMatrix, setServerMatrix] = useState<RolePermissionMatrixResponse | null>(null)
  const matrixQuery = useQuery({ queryKey: ['feature-permissions'], queryFn: getFeaturePermissions, retry: false })
  const canManage = hasPermission(user, PERMISSIONS.FEATURE_PERMISSIONS_MANAGE)

  useEffect(() => { if (!matrixQuery.data || !isValidMatrixResponse(matrixQuery.data)) return; const snap = cloneMatrix(matrixQuery.data); setServerMatrix(snap); setLocalMatrix(cloneMatrix(snap)) }, [matrixQuery.data])

  const mutation = useMutation({ mutationFn: (payload: FeaturePermissionUpdatePayload) => updateFeaturePermissions(payload), onSuccess: async (response) => { const snap = cloneMatrix(response); setServerMatrix(snap); setLocalMatrix(cloneMatrix(snap)); await queryClient.invalidateQueries({ queryKey: ['feature-permissions'] }); await queryClient.invalidateQueries({ queryKey: ['auth', 'user'] }); await refreshUser() } })
  const dirty = useMemo(() => localMatrix && serverMatrix ? JSON.stringify(localMatrix.matrix) !== JSON.stringify(serverMatrix.matrix) : false, [localMatrix, serverMatrix])

  if (matrixQuery.isLoading) return <LoadingState />
  if (matrixQuery.isError) return <ErrorState message={toReadableError(matrixQuery.error)} />
  if (matrixQuery.data && !isValidMatrixResponse(matrixQuery.data)) return <ErrorState message={INVALID_MATRIX_MESSAGE} />
  if (!localMatrix || localMatrix.permissions.length === 0 || localMatrix.roles.length === 0) return <EmptyState message='Keine Berechtigungen vorhanden.' />

  const toggle = (roleKey: 'app-admin' | 'app-user', permissionKey: string) => setLocalMatrix((prev) => prev ? { ...prev, matrix: prev.matrix.map((row) => matrixKey(row) === `${roleKey}:${permissionKey}` ? { ...row, enabled: !row.enabled } : row) } : prev)
  return <section className="space-y-4"><div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Feature-Rechte</h1><button type="button" className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!canManage || !dirty || mutation.isPending} onClick={() => { if (localMatrix) mutation.mutate({ matrix: localMatrix.matrix }) }}>Speichern</button></div>{!canManage && <ErrorState message={NO_PERMISSION_MESSAGE} />}{mutation.isError && <ErrorState message={toReadableError(mutation.error)} />}<div className="overflow-auto rounded border bg-white"><table className="min-w-full text-sm"><thead><tr className="border-b bg-slate-50 text-left"><th className="p-2">Berechtigung</th>{localMatrix.roles.map((role) => <th key={role.key} className="p-2">{role.label ?? role.key}</th>)}</tr></thead><tbody>{localMatrix.permissions.map((permission) => <tr key={permission.key} className="border-b"><td className="p-2">{permission.label ?? permission.key}</td>{localMatrix.roles.map((role) => { const cell = localMatrix.matrix.find((row) => row.role_key === role.key && row.permission_key === permission.key); return <td key={`${role.key}-${permission.key}`} className="p-2"><input type="checkbox" checked={cell?.enabled === true} disabled={!canManage || !cell} onChange={() => toggle(role.key, permission.key)} /></td> })}</tr>)}</tbody></table></div></section>
}
