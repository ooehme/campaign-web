import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { deleteArea, listAreas } from '../api/endpoints'
import { ApiError } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { can, canPermission, NO_PERMISSION_MESSAGE } from '../utils/permissions'
import { useAuth } from '../auth/AuthContext'
import type { Area, AreaAssignmentRef } from '../types/models'

type AreaGroupItem = {
  area: Area
  assignment?: AreaAssignmentRef
}

type AreaGroup = {
  key: string
  title: string
  boundary?: Area
  targets: AreaGroupItem[]
  standalone: AreaGroupItem[]
}

const areaNameSort = (a: Pick<Area, 'name'>, b: Pick<Area, 'name'>) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })
const areaItemSort = (a: AreaGroupItem, b: AreaGroupItem) => areaNameSort(a.area, b.area)

const getAssignments = (area: Area) => (area.assignments ?? area.campaigns ?? []) as AreaAssignmentRef[]

const getEffectiveAssignments = (area: Area) => {
  const assignments = getAssignments(area)
  if (assignments.length > 0) return assignments
  if (area.pivot?.usage) return [{ ...area.pivot }] as AreaAssignmentRef[]
  return []
}

const isBoundaryArea = (area: Area) => getEffectiveAssignments(area).some((entry) => entry.usage === 'boundary')

const getBoundaryTitle = (boundaryId: number, areasById: Map<number, Area>) => areasById.get(boundaryId)?.name ?? `Begrenzungsfläche ${boundaryId}`

const getAssignmentCampaignLabel = (assignment?: AreaAssignmentRef) => {
  if (!assignment) return null
  const campaignName = assignment.campaign_name ?? assignment.name
  const campaignId = assignment.campaign_id ?? assignment.id
  if (campaignName) return campaignName
  if (campaignId) return `Kampagne ${campaignId}`
  return null
}

function AreaCard({ area, assignment, onDelete }: { area: Area; assignment?: AreaAssignmentRef; onDelete: (area: Area) => void }) {
  const assignments = getEffectiveAssignments(area)
  const usageLabels = assignments
    .map((entry) => entry.usage === 'boundary' ? 'Begrenzung' : entry.usage === 'target' ? 'Zielgebiet' : '')
    .filter(Boolean)
  const usageLabel = assignment?.usage === 'boundary'
    ? 'Begrenzung'
    : assignment?.usage === 'target'
      ? 'Zielgebiet'
      : area.pivot?.usage === 'boundary'
        ? 'Begrenzung'
        : area.pivot?.usage === 'target'
          ? 'Zielgebiet'
          : usageLabels[0] ?? 'Pool-Fläche'
  const campaignLabel = getAssignmentCampaignLabel(assignment)

  return (
    <article className="flex min-h-40 flex-col justify-between rounded border bg-white p-3 text-sm">
      <div className="space-y-2">
        <div>
          <Link className="font-medium text-blue-700" to={`/areas/${area.id}`}>{area.name}</Link>
          <p className="text-xs text-slate-500">ID: {area.id}</p>
        </div>
        <p className="text-xs text-slate-600">{usageLabel}</p>
        {campaignLabel && <p className="text-xs text-slate-500">Kampagne: {campaignLabel}</p>}
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
    const unassigned: AreaGroup = {
      key: 'ungrouped',
      title: 'Ohne übergeordnete Begrenzungsfläche',
      targets: [],
      standalone: [],
    }

    const ensureGroup = (key: string, title: string) => {
      if (!grouped.has(key)) grouped.set(key, { key, title, targets: [], standalone: [] })
      return grouped.get(key) as AreaGroup
    }

    for (const area of areas) {
      const assignments = getEffectiveAssignments(area)
      const targetAssignments = assignments.filter((entry) => entry.usage === 'target')

      if (isBoundaryArea(area)) {
        const group = ensureGroup(`boundary-${area.id}`, area.name)
        group.boundary = area
      }

      if (targetAssignments.length === 0) {
        if (!isBoundaryArea(area)) unassigned.standalone.push({ area })
        continue
      }

      for (const assignment of targetAssignments) {
        if (assignment.boundary_area_id) {
          ensureGroup(`boundary-${assignment.boundary_area_id}`, getBoundaryTitle(assignment.boundary_area_id, areasById)).targets.push({ area, assignment })
        } else {
          unassigned.targets.push({ area, assignment })
        }
      }
    }

    const result = [...grouped.values()]
    if (unassigned.targets.length > 0 || unassigned.standalone.length > 0) result.push(unassigned)

    return result
      .map((group) => ({
        ...group,
        targets: [...group.targets].sort(areaItemSort),
        standalone: [...group.standalone].sort(areaItemSort),
      }))
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
              <span className="text-xs text-slate-500">{group.targets.length} Zielgebiet(e), {group.standalone.length + (group.boundary ? 1 : 0)} weitere Fläche(n) {isOpen ? 'einklappen' : 'ausklappen'}</span>
            </button>
            {isOpen && (
              <div className="space-y-3">
                {group.boundary && (
                  <div className="rounded border border-blue-200 bg-blue-50 p-3">
                    <p className="mb-2 text-xs font-medium uppercase text-blue-700">Begrenzungsfläche</p>
                    <div className="grid gap-3 md:grid-cols-3">
                      <AreaCard
                        area={group.boundary}
                        assignment={getEffectiveAssignments(group.boundary).find((entry) => entry.usage === 'boundary')}
                        onDelete={(selectedArea) => window.confirm(`Fläche "${selectedArea.name}" löschen?`) && del.mutate(selectedArea.id)}
                      />
                    </div>
                  </div>
                )}
                {group.targets.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-slate-600">Zielgebiete</p>
                    <div className="grid gap-3 md:grid-cols-3">
                      {group.targets.map(({ area, assignment }, index) => (
                        <AreaCard
                          key={`${area.id}-${assignment?.campaign_id ?? assignment?.id ?? index}`}
                          area={area}
                          assignment={assignment}
                          onDelete={(selectedArea) => window.confirm(`Fläche "${selectedArea.name}" löschen?`) && del.mutate(selectedArea.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {group.standalone.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-slate-600">Weitere Flächen</p>
                    <div className="grid gap-3 md:grid-cols-3">
                      {group.standalone.map(({ area }) => (
                        <AreaCard
                          key={area.id}
                          area={area}
                          onDelete={(selectedArea) => window.confirm(`Fläche "${selectedArea.name}" löschen?`) && del.mutate(selectedArea.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )
      })}
    </section>
  )
}
