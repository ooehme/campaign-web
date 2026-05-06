import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { deleteArea, listAreas } from '../api/endpoints'
import { ApiError } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { can, canPermission, NO_PERMISSION_MESSAGE } from '../utils/permissions'
import { useAuth } from '../auth/AuthContext'
import type { Area, AreaAssignmentRef } from '../types/models'

type AreaGroup = {
  key: string
  title: string
  areas: Area[]
}

const areaNameSort = (a: Pick<Area, 'name'>, b: Pick<Area, 'name'>) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })

const getAssignments = (area: Area) => (area.assignments ?? area.campaigns ?? []) as AreaAssignmentRef[]

const getBoundaryParentId = (area: Area) => {
  if (area.pivot?.usage === 'target' && area.pivot.boundary_area_id) return area.pivot.boundary_area_id
  const assignment = getAssignments(area).find((entry) => entry.usage === 'target' && entry.boundary_area_id)
  return assignment?.boundary_area_id ?? null
}

const getBoundaryTitle = (boundaryId: number, areasById: Map<number, Area>) => areasById.get(boundaryId)?.name ?? `Begrenzungsfläche ${boundaryId}`

function AreaCard({ area, onDelete }: { area: Area; onDelete: (area: Area) => void }) {
  const assignments = getAssignments(area)
  const usageLabels = assignments
    .map((entry) => entry.usage === 'boundary' ? 'Begrenzung' : entry.usage === 'target' ? 'Zielgebiet' : '')
    .filter(Boolean)
  const usageLabel = area.pivot?.usage === 'boundary'
    ? 'Begrenzung'
    : area.pivot?.usage === 'target'
      ? 'Zielgebiet'
      : usageLabels[0] ?? 'Pool-Fläche'

  return (
    <article className="flex min-h-40 flex-col justify-between rounded border bg-white p-3 text-sm">
      <div className="space-y-2">
        <div>
          <Link className="font-medium text-blue-700" to={`/areas/${area.id}`}>{area.name}</Link>
          <p className="text-xs text-slate-500">ID: {area.id}</p>
        </div>
        <p className="text-xs text-slate-600">{usageLabel}</p>
        <p className="line-clamp-2 text-xs text-slate-500">GeoJSON: {area.geojson ? JSON.stringify(area.geojson).slice(0, 120) : 'Keine Geometrie'}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          className={`rounded border px-3 py-1 text-sm ${!can(area.can?.update) ? 'pointer-events-none opacity-50' : ''}`}
          title={!can(area.can?.update) ? NO_PERMISSION_MESSAGE : undefined}
          to={`/areas/${area.id}/edit`}
        >
          Bearbeiten
        </Link>
        <button
          type="button"
          className="bg-red-600 text-white disabled:opacity-50"
          disabled={!can(area.can?.delete)}
          title={!can(area.can?.delete) ? NO_PERMISSION_MESSAGE : undefined}
          onClick={() => onDelete(area)}
        >
          Löschen
        </button>
      </div>
    </article>
  )
}

export function AreasPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [success, setSuccess] = useState('')
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['areas-pool'], queryFn: () => listAreas({ per_page: 100 }) })

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['areas-pool'] }); qc.invalidateQueries({ queryKey: ['campaign-areas'] }) }
  const del = useMutation({ mutationFn: deleteArea, onSuccess: () => { invalidate(); setSuccess('Fläche gelöscht.') } })
  const formatError = (e: unknown) => e instanceof ApiError && e.status >= 500 ? 'Serverfehler beim Laden oder Speichern der Fläche.' : e instanceof Error ? e.message : 'Fehler.'

  const groups = useMemo<AreaGroup[]>(() => {
    const areas = [...(data?.data ?? [])].sort(areaNameSort)
    const areasById = new Map(areas.map((area) => [area.id, area]))
    const grouped = new Map<string, AreaGroup>()

    const ensureGroup = (key: string, title: string) => {
      if (!grouped.has(key)) grouped.set(key, { key, title, areas: [] })
      return grouped.get(key) as AreaGroup
    }

    for (const area of areas) {
      const parentId = getBoundaryParentId(area)
      if (parentId) {
        ensureGroup(`boundary-${parentId}`, getBoundaryTitle(parentId, areasById)).areas.push(area)
        continue
      }
      if (area.pivot?.usage === 'boundary' || getAssignments(area).some((entry) => entry.usage === 'boundary')) {
        ensureGroup(`boundary-${area.id}`, area.name).areas.unshift(area)
        continue
      }
      ensureGroup('ungrouped', 'Ohne übergeordnete Begrenzungsfläche').areas.push(area)
    }

    return [...grouped.values()]
      .map((group) => ({ ...group, areas: [...group.areas].sort(areaNameSort) }))
      .sort((a, b) => {
        if (a.key === 'ungrouped') return 1
        if (b.key === 'ungrouped') return -1
        return a.title.localeCompare(b.title, 'de', { sensitivity: 'base' })
      })
  }, [data])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Flächen-Pool</h1>
        <Link
          className={`rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white ${!canPermission(user?.can, 'areas.create') ? 'pointer-events-none opacity-50' : ''}`}
          title={!canPermission(user?.can, 'areas.create') ? NO_PERMISSION_MESSAGE : undefined}
          to="/areas/new"
        >
          Neue Fläche anlegen
        </Link>
      </div>

      {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}
      {isLoading && <LoadingState />}
      {isError && <ErrorState message={formatError(error)} />}
      {data && data.data.length === 0 && <EmptyState message="Noch keine Flächen vorhanden." />}

      {groups.map((group) => {
        const isOpen = openGroups[group.key] ?? true
        return (
          <section key={group.key} className="space-y-3 rounded border bg-slate-50 p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded border bg-white px-3 py-2 text-left"
              aria-expanded={isOpen}
              onClick={() => setOpenGroups((current) => ({ ...current, [group.key]: !isOpen }))}
            >
              <span className="font-medium">{group.title}</span>
              <span className="text-xs text-slate-500">{group.areas.length} Fläche(n) {isOpen ? 'einklappen' : 'ausklappen'}</span>
            </button>
            {isOpen && (
              <div className="grid gap-3 md:grid-cols-3">
                {group.areas.map((area) => (
                  <AreaCard
                    key={area.id}
                    area={area}
                    onDelete={(selectedArea) => window.confirm(`Fläche "${selectedArea.name}" löschen?`) && del.mutate(selectedArea.id)}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </section>
  )
}
