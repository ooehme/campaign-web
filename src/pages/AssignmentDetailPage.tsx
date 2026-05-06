import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { ApiError } from '../api/client'
import { createPosterLocation, deleteAssignment, deletePosterLocation, getAssignment, listCampaignAreas, listCampaignTeams, listPosterLocations, updateAssignment, updatePosterLocation } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { ASSIGNMENT_STATUSES, MAP_ATTRIBUTION, MAP_TILE_URL, POSTER_LOCATION_STATUSES } from '../utils/constants'
import { assignmentStatusLabel, assignmentTypeLabel } from '../utils/assignment'
import { getGeometryFromAreaGeoJson } from '../utils/campaignAreaMap'
import { can, canPermission, NO_PERMISSION_MESSAGE, permissionErrorMessage } from '../utils/permissions'
import { PERMISSIONS } from '../utils/permissionKeys'
import type { Area, Assignment, AssignmentTypeConfig, PosterLocation } from '../types/models'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]

const assignmentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  targetArea: z.string().min(1),
  teamId: z.coerce.number().optional(),
  status: z.enum(ASSIGNMENT_STATUSES),
  startsAt: z.string().optional(),
  dueAt: z.string().optional(),
})

const posterLocationSchema = z.object({
  id: z.number().optional(),
  label: z.string().max(255).optional().nullable(),
  notes: z.string().optional().nullable(),
  lat: z.coerce.number().min(-90, 'Breitengrad muss zwischen -90 und 90 liegen.').max(90, 'Breitengrad muss zwischen -90 und 90 liegen.'),
  lng: z.coerce.number().min(-180, 'Längengrad muss zwischen -180 und 180 liegen.').max(180, 'Längengrad muss zwischen -180 und 180 liegen.'),
  status: z.enum(POSTER_LOCATION_STATUSES),
  photoUrl: z.string().optional().nullable(),
})

type AssignmentFormValues = z.infer<typeof assignmentSchema>
type PosterLocationFormValues = z.infer<typeof posterLocationSchema>

const requestErrorMessage = (error: unknown) => {
  if (!(error instanceof ApiError)) return permissionErrorMessage(error)
  if (error.status === 401) return 'Bitte erneut anmelden.'
  if (error.status === 403) return 'Keine Berechtigung für diese Aktion.'
  if (error.status === 404) return 'Auftrag nicht gefunden.'
  if (error.status >= 500) return 'Serverfehler beim Speichern des Auftrags.'
  return permissionErrorMessage(error)
}

const configInstructions = (config: AssignmentTypeConfig | null | undefined) => {
  if (!config || !('mandatoryInstructions' in config)) return []
  return Array.isArray(config.mandatoryInstructions) ? config.mandatoryInstructions : []
}

const requiresPhotoProof = (assignment: Assignment) => {
  const config = assignment.typeConfig
  return Boolean(config && 'requirePhotoProof' in config && config.requirePhotoProof)
}

function FitMap({ areas, posterLocations }: { areas: Area[]; posterLocations: PosterLocation[] }) {
  const map = useMap()
  useEffect(() => {
    const positions: [number, number][] = []
    for (const area of areas) {
      const geo = getGeometryFromAreaGeoJson(area.geojson)
      if (!geo) continue
      if (geo.type === 'FeatureCollection') {
        for (const feature of geo.features) {
          if (!feature.geometry) continue
          const coordinates = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates.flat() : feature.geometry.coordinates.flat(2)
          for (const [lng, lat] of coordinates) positions.push([lat, lng])
        }
        continue
      }
      const coordinates = geo.type === 'Polygon' ? geo.coordinates.flat() : geo.coordinates.flat(2)
      for (const [lng, lat] of coordinates) positions.push([lat, lng])
    }
    for (const posterLocation of posterLocations) positions.push([posterLocation.lat, posterLocation.lng])
    if (positions.length > 0) map.fitBounds(positions, { padding: [30, 30] })
  }, [areas, posterLocations, map])
  return null
}

function MapClickPicker({ enabled, onPick }: { enabled: boolean; onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (event) => { if (enabled) onPick(event.latlng.lat, event.latlng.lng) } })
  return null
}

export function AssignmentDetailPage() {
  const { assignmentId } = useParams()
  const id = Number(assignmentId)
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [posterLocationFormError, setPosterLocationFormError] = useState<string | null>(null)
  const [posterLocationEditorOpen, setPosterLocationEditorOpen] = useState(false)

  const assignmentForm = useForm<AssignmentFormValues>({ resolver: zodResolver(assignmentSchema), defaultValues: { title: '', description: '', targetArea: '', status: 'draft' } })
  const posterLocationForm = useForm<PosterLocationFormValues>({ resolver: zodResolver(posterLocationSchema), defaultValues: { label: '', notes: '', lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1], status: 'planned', photoUrl: '' } })

  const assignmentQuery = useQuery({ queryKey: ['assignment', id], queryFn: () => getAssignment(id), enabled: Number.isFinite(id) })
  const assignment = assignmentQuery.data
  const posterLocationToolsVisible = assignment?.type === 'poster_free' || assignment?.type === 'poster_guided'
  const posterLocationsQuery = useQuery({ queryKey: ['poster-locations', id], queryFn: () => listPosterLocations(id), enabled: Number.isFinite(id) && posterLocationToolsVisible })
  const areasQuery = useQuery({ queryKey: ['campaign-areas', assignment?.campaignId], queryFn: () => listCampaignAreas(assignment!.campaignId!, { per_page: 100 }), enabled: Boolean(assignment?.campaignId) })
  const teamsQuery = useQuery({ queryKey: ['campaign-teams', assignment?.campaignId], queryFn: () => listCampaignTeams(assignment!.campaignId!, { per_page: 100 }), enabled: Boolean(assignment?.campaignId) })
  const isEditMode = location.pathname.endsWith('/edit')

  useEffect(() => {
    if (!assignment) return
    assignmentForm.reset({
      title: assignment.title,
      description: String(assignment.description ?? ''),
      targetArea: assignment.targetArea,
      teamId: assignment.team?.id ?? assignment.teamId ?? undefined,
      status: assignment.status,
      startsAt: assignment.startsAt ? String(assignment.startsAt).slice(0, 16) : '',
      dueAt: assignment.dueAt ? String(assignment.dueAt).slice(0, 16) : '',
    })
  }, [assignment, assignmentForm])

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['assignment', id] })
    queryClient.invalidateQueries({ queryKey: ['assignments'] })
    queryClient.invalidateQueries({ queryKey: ['poster-locations', id] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-campaign-assignments'] })
  }

  const updateAssignmentMutation = useMutation({
    mutationFn: (values: AssignmentFormValues) => updateAssignment(id, { ...values, teamId: values.teamId ?? null }),
    onSuccess: invalidateAll,
  })
  const deleteAssignmentMutation = useMutation({ mutationFn: () => deleteAssignment(id), onSuccess: () => navigate('/assignments') })
  const createPosterLocationMutation = useMutation({
    mutationFn: (payload: Partial<PosterLocation>) => createPosterLocation(id, payload),
    onSuccess: () => {
      invalidateAll()
      posterLocationForm.reset({ label: '', notes: '', lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1], status: 'planned', photoUrl: '' })
      setPosterLocationFormError(null)
    },
  })
  const updatePosterLocationMutation = useMutation({ mutationFn: (payload: { id: number; data: Partial<PosterLocation> }) => updatePosterLocation(payload.id, payload.data), onSuccess: invalidateAll })
  const deletePosterLocationMutation = useMutation({ mutationFn: (posterLocationId: number) => deletePosterLocation(posterLocationId), onSuccess: invalidateAll })

  if (!Number.isFinite(id)) return <ErrorState message="Auftrag nicht gefunden." />
  if (assignmentQuery.isLoading) return <LoadingState />
  if (assignmentQuery.isError) return <ErrorState message={requestErrorMessage(assignmentQuery.error)} />
  if (!assignment) return <EmptyState message="Auftrag nicht gefunden." />
  if (posterLocationsQuery.isLoading) return <LoadingState />
  if (posterLocationsQuery.isError) return <ErrorState message={requestErrorMessage(posterLocationsQuery.error)} />

  const posterLocations = (posterLocationsQuery.data ?? assignment.posterLocations ?? []).slice().sort((a, b) => a.id - b.id)
  const campaignAreas = areasQuery.data?.data ?? []
  const mapAreas = campaignAreas.filter((area) => area.name === assignment.targetArea || assignment.targetArea.includes(String(area.id)))
  const canManagePosterLocations = canPermission(user?.can, PERMISSIONS.POSTER_LOCATIONS_MANAGE) && can(assignment.can?.manage_poster_locations ?? true)
  const canCreatePosterLocations = assignment.type === 'poster_free' ? canManagePosterLocations : canManagePosterLocations && isEditMode
  const photoRequired = requiresPhotoProof(assignment)

  const savePosterLocation = (values: PosterLocationFormValues) => {
    if (photoRequired && values.status === 'installed' && !values.photoUrl?.trim()) {
      setPosterLocationFormError('Für installierte Plakatstandorte ist ein Foto erforderlich.')
      return
    }
    const payload: Partial<PosterLocation> = {
      label: values.label ?? null,
      notes: values.notes ?? null,
      lat: values.lat,
      lng: values.lng,
      status: values.status,
      photoUrl: values.photoUrl || null,
    }
    if (values.id) updatePosterLocationMutation.mutate({ id: values.id, data: payload })
    else createPosterLocationMutation.mutate(payload)
    setPosterLocationFormError(null)
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold">Auftrag #{assignment.id}: {assignment.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Link className="border px-3 py-2 text-sm" to={assignment.campaignId ? `/campaigns/${assignment.campaignId}` : '/assignments'}>Zurück</Link>
          {isEditMode
            ? <Link className="border px-3 py-2 text-sm" to={`/assignments/${assignment.id}`}>Detailansicht</Link>
            : <Link className={`border px-3 py-2 text-sm ${!can(assignment.can?.update) ? 'pointer-events-none opacity-50' : ''}`} title={!can(assignment.can?.update) ? NO_PERMISSION_MESSAGE : undefined} to={`/assignments/${assignment.id}/edit`}>Auftrag bearbeiten</Link>}
        </div>
      </div>

      <div className="rounded border bg-white p-4"><h2 className="mb-2 font-medium">Übersicht</h2><p>{assignmentTypeLabel[assignment.type]} · {assignmentStatusLabel[assignment.status]}</p><p className="text-sm text-slate-600">Zielgebiet: {assignment.targetArea}</p></div>
      <div className="rounded border bg-white p-4"><h2 className="mb-2 font-medium">Team</h2><p>{assignment.team?.name ?? assignment.teamId ?? 'Kein Team zugewiesen.'}</p></div>
      <div className="rounded border bg-white p-4"><h2 className="mb-2 font-medium">Anweisungen</h2>{configInstructions(assignment.typeConfig).length === 0 ? <p>Keine Anweisungen hinterlegt.</p> : <ul className="list-disc pl-5">{configInstructions(assignment.typeConfig).map((instruction) => <li key={instruction}>{instruction}</li>)}</ul>}</div>

      {posterLocationToolsVisible && (
        <>
          <div className="rounded border bg-white p-4">
            <details open>
              <summary className="cursor-pointer font-medium">Plakatstandorte ({posterLocations.length})</summary>
              <div className="mt-3 space-y-2">
                {posterLocations.length === 0 && <EmptyState message="Noch keine Plakatstandorte vorhanden." />}
                {posterLocations.map((posterLocation) => (
                  <article key={posterLocation.id} className="rounded border p-2 text-sm">
                    <p className="font-medium">{posterLocation.label ?? `Standort #${posterLocation.id}`}</p>
                    <p>Status: {posterLocation.status}</p>
                    <p>{posterLocation.notes ?? 'Keine Notizen.'}</p>
                    <p>Koordinaten: {posterLocation.lat}, {posterLocation.lng}</p>
                    <p>Foto: {posterLocation.photoUrl ?? '-'}</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" className="border px-2 disabled:opacity-50" disabled={!canManagePosterLocations || !can(posterLocation.can?.update)} title={!canManagePosterLocations ? NO_PERMISSION_MESSAGE : undefined} onClick={() => { posterLocationForm.reset({ id: posterLocation.id, label: posterLocation.label ?? '', notes: posterLocation.notes ?? '', lat: posterLocation.lat, lng: posterLocation.lng, status: posterLocation.status, photoUrl: posterLocation.photoUrl ?? '' }); setPosterLocationEditorOpen(true) }}>
                        Standort bearbeiten
                      </button>
                      <button type="button" className="border px-2 disabled:opacity-50" disabled={!canManagePosterLocations || !can(posterLocation.can?.delete)} title={!canManagePosterLocations ? NO_PERMISSION_MESSAGE : undefined} onClick={() => deletePosterLocationMutation.mutate(posterLocation.id)}>
                        Standort entfernen
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </details>
          </div>

          <div className="rounded border bg-white p-4">
            <details open={posterLocationEditorOpen || assignment.type === 'poster_free'} onToggle={(event) => setPosterLocationEditorOpen(event.currentTarget.open)}>
              <summary className="cursor-pointer font-medium">Plakatstandort hinzufügen / bearbeiten</summary>
              <form className="mt-3 space-y-2" onSubmit={posterLocationForm.handleSubmit(savePosterLocation)}>
                <input placeholder="Label" {...posterLocationForm.register('label')} disabled={!canCreatePosterLocations && !posterLocationForm.watch('id')} title={!canCreatePosterLocations ? NO_PERMISSION_MESSAGE : undefined} />
                <textarea rows={2} placeholder="Notizen" {...posterLocationForm.register('notes')} disabled={!canManagePosterLocations} />
                <div className="grid gap-2 md:grid-cols-2">
                  <input type="number" step="any" placeholder="Breitengrad" {...posterLocationForm.register('lat')} disabled={!canManagePosterLocations} />
                  <input type="number" step="any" placeholder="Längengrad" {...posterLocationForm.register('lng')} disabled={!canManagePosterLocations} />
                </div>
                <select {...posterLocationForm.register('status')} disabled={!canManagePosterLocations}>{POSTER_LOCATION_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
                <input placeholder="Foto-URL" {...posterLocationForm.register('photoUrl')} disabled={!canManagePosterLocations} />
                <button type="submit" className="bg-slate-900 px-3 py-1 text-white disabled:opacity-50" disabled={!canManagePosterLocations || (!canCreatePosterLocations && !posterLocationForm.watch('id'))}>{posterLocationForm.watch('id') ? 'Standort bearbeiten' : 'Standort hinzufügen'}</button>
              </form>
              {posterLocationFormError && <ErrorState message={posterLocationFormError} />}
              {posterLocationForm.formState.errors.lat && <ErrorState message={posterLocationForm.formState.errors.lat.message ?? ''} />}
              {posterLocationForm.formState.errors.lng && <ErrorState message={posterLocationForm.formState.errors.lng.message ?? ''} />}
            </details>
          </div>

          <div className="rounded border bg-white p-4">
            <details open>
              <summary className="cursor-pointer font-medium">Karte</summary>
              <div className="mt-3 h-96 overflow-hidden rounded border">
                {mapAreas.length === 0 && posterLocations.length === 0 ? <div className="p-3 text-sm text-slate-600">Keine Kartenobjekte für diesen Auftrag vorhanden.</div> : (
                  <MapContainer center={DEFAULT_CENTER} zoom={6} className="h-full w-full">
                    <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
                    <MapClickPicker enabled={canCreatePosterLocations} onPick={(lat, lng) => { posterLocationForm.setValue('lat', Number(lat.toFixed(6))); posterLocationForm.setValue('lng', Number(lng.toFixed(6))); setPosterLocationEditorOpen(true) }} />
                    {mapAreas.map((area) => <GeoJSON key={area.id} data={area.geojson as GeoJSON.GeoJsonObject} style={{ color: '#0f766e', weight: 2, fillOpacity: 0.2 }} />)}
                    {posterLocations.map((posterLocation) => (
                      <Marker key={posterLocation.id} position={[posterLocation.lat, posterLocation.lng]} draggable={canManagePosterLocations && can(posterLocation.can?.update)} eventHandlers={{ dragend: (event) => { const latLng = event.target.getLatLng(); updatePosterLocationMutation.mutate({ id: posterLocation.id, data: { lat: latLng.lat, lng: latLng.lng } }) } }}>
                        <Popup><p className="font-medium">{posterLocation.label ?? `Standort #${posterLocation.id}`}</p><p>{posterLocation.notes ?? '-'}</p><p>Status: {posterLocation.status}</p></Popup>
                      </Marker>
                    ))}
                    <FitMap areas={mapAreas} posterLocations={posterLocations} />
                  </MapContainer>
                )}
              </div>
            </details>
          </div>
        </>
      )}

      {isEditMode && (
        <div className="rounded border bg-white p-4">
          <h2 className="mb-2 font-medium">Auftrag bearbeiten</h2>
          <form className="space-y-2" onSubmit={assignmentForm.handleSubmit((values) => updateAssignmentMutation.mutate(values))}>
            <input {...assignmentForm.register('title')} disabled={!can(assignment.can?.update)} title={!can(assignment.can?.update) ? NO_PERMISSION_MESSAGE : undefined} />
            <textarea rows={3} {...assignmentForm.register('description')} disabled={!can(assignment.can?.update)} />
            <input {...assignmentForm.register('targetArea')} disabled={!can(assignment.can?.update)} />
            <div className="grid gap-2 md:grid-cols-2">
              <select {...assignmentForm.register('status')} disabled={!can(assignment.can?.change_status)}>{ASSIGNMENT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
              <select {...assignmentForm.register('teamId')} disabled={!can(assignment.can?.assign_team)}><option value="">Zugewiesenes Team</option>{(teamsQuery.data?.data ?? []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <input type="datetime-local" {...assignmentForm.register('startsAt')} disabled={!can(assignment.can?.update)} />
              <input type="datetime-local" {...assignmentForm.register('dueAt')} disabled={!can(assignment.can?.update)} />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="bg-slate-900 text-white disabled:opacity-50" disabled={!can(assignment.can?.update)}>Speichern</button>
              <button type="button" className="bg-red-600 text-white disabled:opacity-50" disabled={!can(assignment.can?.delete)} onClick={() => window.confirm('Auftrag löschen?') && deleteAssignmentMutation.mutate()}>Löschen</button>
            </div>
          </form>
          {updateAssignmentMutation.isError && <ErrorState message={requestErrorMessage(updateAssignmentMutation.error)} />}
          {deleteAssignmentMutation.isError && <ErrorState message={requestErrorMessage(deleteAssignmentMutation.error)} />}
        </div>
      )}
    </section>
  )
}
