import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { getCampaign, getTasksPage, listCampaignAreas, listCampaignAreasMap, listCampaignTeams } from '../api/endpoints'
import { ApiError } from '../api/client'
import { CampaignAreaMap } from '../components/CampaignAreaMap'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { splitCampaignAreasByUsage } from '../utils/campaignAreaMap'
import { can } from '../utils/permissions'

const message = (error: unknown) => {
  if (!(error instanceof ApiError)) return 'Unbekannter Fehler.'
  if (error.status === 401) return 'Nicht angemeldet (401).'
  if (error.status === 403) return 'Keine Berechtigung (403).'
  if (error.status >= 500) return 'Serverfehler (500).'
  return error.message
}

export function CampaignDetailPage() {
  const { campaignId } = useParams()
  const id = Number(campaignId)

  const campaignQuery = useQuery({ queryKey: ['campaign', id], queryFn: () => getCampaign(id), enabled: Number.isFinite(id) })
  const assignedAreasQuery = useQuery({ queryKey: ['campaign-areas', id], queryFn: () => listCampaignAreas(id, { per_page: 100 }), enabled: Number.isFinite(id) })
  const campaignAreasMapQuery = useQuery({ queryKey: ['campaign-areas-map', id], queryFn: () => listCampaignAreasMap(id), enabled: Number.isFinite(id) })
  const assignedTeamsQuery = useQuery({ queryKey: ['campaign-teams', id], queryFn: () => listCampaignTeams(id, { per_page: 100 }), enabled: Number.isFinite(id) })
  const tasksQuery = useQuery({ queryKey: ['tasks', id], queryFn: () => getTasksPage(id, { per_page: 100 }), enabled: Number.isFinite(id) })

  if (!Number.isFinite(id)) return <ErrorState message="Ungültige Kampagnen-ID." />
  if (campaignQuery.isLoading) return <LoadingState />
  if (campaignQuery.isError || !campaignQuery.data) return <ErrorState message="Kampagne konnte nicht geladen werden." />

  const campaign = campaignQuery.data
  const assignedAreas = assignedAreasQuery.data?.data ?? []
  const { boundaries: boundaryAreas, targets: targetAreas, unknown: unknownAreas } = splitCampaignAreasByUsage(assignedAreas)
  const assignedTeams = assignedTeamsQuery.data?.data ?? []
  const tasks = tasksQuery.data?.data ?? []
  const openTasks = tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled')

  return <section className="space-y-6">
    <Link to="/campaigns" className="text-sm text-blue-600">← Zurück zur Kampagnenliste</Link>

    <header className="rounded border bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="text-sm text-slate-500">Kampagnendetails</p>
          <h1 className="text-3xl font-semibold">{campaign.name}</h1>
          <span className="inline-block rounded bg-slate-100 px-2 py-1 text-sm text-slate-700">Status: {campaign.status ?? 'n/a'}</span>
        </div>
        {can(campaign.can?.update) && <Link className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white" to={`/campaigns/${id}/edit`}>Kampagne bearbeiten</Link>}
      </div>
    </header>

    <div className="rounded border bg-white p-4 space-y-2">
      <h2 className="font-medium">Kurzbeschreibung</h2>
      <p className="text-sm text-slate-700">{campaign.description ?? 'Keine Beschreibung hinterlegt.'}</p>
      <dl className="grid gap-2 text-sm md:grid-cols-3">
        <div><dt className="text-slate-500">Slug</dt><dd>{campaign.slug ?? 'n/a'}</dd></div>
        <div><dt className="text-slate-500">Start</dt><dd>{campaign.starts_at ?? 'n/a'}</dd></div>
        <div><dt className="text-slate-500">Ende</dt><dd>{campaign.ends_at ?? 'n/a'}</dd></div>
      </dl>
    </div>

    <CampaignAreaMap
      areas={assignedAreas}
      mapGeoJson={campaignAreasMapQuery.data}
      isLoading={assignedAreasQuery.isLoading}
      errorMessage={assignedAreasQuery.isError || campaignAreasMapQuery.isError ? `Karten-/Flächendaten konnten nicht geladen werden: ${message(assignedAreasQuery.error ?? campaignAreasMapQuery.error)}` : null}
    />

    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded border bg-white p-4 space-y-3">
        <h2 className="font-medium">Zugewiesene Fläche</h2>
        {assignedAreasQuery.isLoading && <LoadingState />}
        {assignedAreasQuery.isError && <ErrorState message={message(assignedAreasQuery.error)} />}
        {boundaryAreas.length === 0 && <EmptyState message="Noch keine Kampagnenfläche zugewiesen." />}
        {boundaryAreas.map((area) => <div key={area.id} className="rounded border p-2 text-sm">
          <Link className="font-medium text-blue-600" to={`/areas/${area.id}`}>{area.name}</Link>
          <p className="text-slate-500">Flächen-ID: {area.id}</p>
          <p className="text-slate-500">Geometrietyp: {area.geojson?.type ?? 'n/a'}</p>
        </div>)}
      </div>

      <div className="rounded border bg-white p-4 space-y-3">
        <h2 className="font-medium">Zielgebiete</h2>
        {assignedAreasQuery.isLoading && <LoadingState />}
        {assignedAreasQuery.isError && <ErrorState message={message(assignedAreasQuery.error)} />}
        {targetAreas.length === 0 && <EmptyState message="Noch keine Zielgebiete zugewiesen." />}
        {targetAreas.map((area) => <div key={area.id} className="rounded border p-2 text-sm">
          <Link className="font-medium text-blue-600" to={`/areas/${area.id}`}>{area.name}</Link>
          {area.pivot?.boundary_area_id && <p className="text-slate-500">Zugeordnete Begrenzung: {boundaryAreas.find((boundary) => boundary.id === area.pivot?.boundary_area_id)?.name ?? `ID ${area.pivot.boundary_area_id}`}</p>}
          {area.pivot?.notes && <p className="text-slate-500">Notizen: {area.pivot.notes}</p>}
        </div>)}
        {unknownAreas.length > 0 && <p className="text-sm text-amber-700">Einige Flächen haben keine Nutzungsart.</p>}
      </div>
    </div>

    <div className="rounded border bg-white p-4 space-y-3">
      <h2 className="font-medium">Zugewiesene Teams</h2>
      {assignedTeamsQuery.isLoading && <LoadingState />}
      {assignedTeamsQuery.isError && <ErrorState message={message(assignedTeamsQuery.error)} />}
      {assignedTeams.length === 0 && <EmptyState message="Noch keine Teams zugewiesen." />}
      <div className="grid gap-2 md:grid-cols-2">
        {assignedTeams.map((team) => <div key={team.id} className="rounded border p-2 text-sm">
          <Link className="font-medium text-blue-600" to={`/teams/${team.id}`}>{team.name}</Link>
          <p className="text-slate-500">Teamlead: {team.users?.find((member) => member.pivot?.role === 'lead')?.name ?? 'n/a'}</p>
          <p className="text-slate-500">Mitglieder: {team.users?.length ?? 'n/a'}</p>
        </div>)}
      </div>
    </div>

    <div className="rounded border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Aufgabenübersicht</h2>
        <Link className="text-sm text-blue-600" to={`/campaigns/${id}/tasks`}>Alle Aufgaben anzeigen</Link>
      </div>
      {tasksQuery.isLoading && <LoadingState />}
      {tasksQuery.isError && <ErrorState message={message(tasksQuery.error)} />}
      <div className="grid gap-2 text-sm md:grid-cols-3">
        <div className="rounded bg-slate-50 p-3"><p className="text-slate-500">Gesamt</p><p className="text-2xl font-semibold">{tasks.length}</p></div>
        <div className="rounded bg-slate-50 p-3"><p className="text-slate-500">Offen/aktiv</p><p className="text-2xl font-semibold">{openTasks.length}</p></div>
        <div className="rounded bg-slate-50 p-3"><p className="text-slate-500">Abgeschlossen</p><p className="text-2xl font-semibold">{tasks.filter((task) => task.status === 'done').length}</p></div>
      </div>
      {tasks.length === 0 && <EmptyState message="Noch keine Aufträge vorhanden." />}
      {tasks.slice(0, 10).map((task) => <p key={task.id} className="text-sm"><Link className="text-blue-600" to={`/tasks/${task.id}`}>{task.title}</Link> · {task.status}</p>)}
    </div>
  </section>
}
