import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { getCampaign, getTeam, listCampaignAreas, listCampaignAreasMap, listCampaignAssignments, listCampaignTeams, listUserTeams, updateAssignment } from '../api/endpoints'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { CampaignAreaMap } from '../components/CampaignAreaMap'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { splitCampaignAreasByUsage } from '../utils/campaignAreaMap'
import { can } from '../utils/permissions'
import { assignedTeamId, assignmentStatusLabel, assignmentTypeLabel, isAssignedToLeadTeam, isClosedAssignment, leadTeamsByAssignedCampaign, leadTeamsFromCampaignTeams, uniqueTeams } from '../utils/assignment'
import type { Assignment, UserTeam } from '../types/models'

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
  const { user } = useAuth()
  const qc = useQueryClient()

  const campaignQuery = useQuery({ queryKey: ['campaign', id], queryFn: () => getCampaign(id), enabled: Number.isFinite(id) })
  const assignedAreasQuery = useQuery({ queryKey: ['campaign-areas', id], queryFn: () => listCampaignAreas(id, { per_page: 100 }), enabled: Number.isFinite(id) })
  const campaignAreasMapQuery = useQuery({ queryKey: ['campaign-areas-map', id], queryFn: () => listCampaignAreasMap(id), enabled: Number.isFinite(id) })
  const assignedTeamsQuery = useQuery({ queryKey: ['campaign-teams', id], queryFn: () => listCampaignTeams(id, { per_page: 100 }), enabled: Number.isFinite(id) })
  const assignmentsQuery = useQuery({ queryKey: ['assignments', 'campaign', id], queryFn: () => listCampaignAssignments(id, { per_page: 100 }), enabled: Number.isFinite(id) })
  const userTeamsQuery = useQuery({ queryKey: ['campaign-detail-user-teams', user?.id], queryFn: () => listUserTeams(user!.id), enabled: Boolean(user?.id), retry: false })
  const teamDetailsQuery = useQuery({
    queryKey: ['campaign-detail-team-details', assignedTeamsQuery.data?.data.map((team) => team.id).join(',')],
    queryFn: async () => {
      const results = await Promise.allSettled((assignedTeamsQuery.data?.data ?? []).map((team) => getTeam(team.id)))
      return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
    },
    enabled: Boolean(assignedTeamsQuery.data?.data.length),
    retry: false,
  })

  const assignAssignmentMutation = useMutation({
    mutationFn: ({ assignmentId, teamId }: { assignmentId: number; teamId: number | null }) => updateAssignment(assignmentId, { teamId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] })
      qc.invalidateQueries({ queryKey: ['dashboard-campaign-assignments'] })
      window.alert('Auftrag wurde aktualisiert.')
    },
    onError: () => window.alert('Auftrag konnte nicht aktualisiert werden.'),
  })

  if (!Number.isFinite(id)) return <ErrorState message="Ungültige Kampagnen-ID." />
  if (campaignQuery.isLoading) return <LoadingState />
  if (campaignQuery.isError || !campaignQuery.data) {
    if (campaignQuery.error instanceof ApiError && campaignQuery.error.status === 403) {
      return <ErrorState title="Kampagne nicht freigegeben" message="Ihr Konto darf diese Kampagne nicht anzeigen." actionLabel="Zur Kampagnenliste" actionTo="/campaigns" />
    }
    return <ErrorState message="Kampagne konnte nicht geladen werden." />
  }

  const campaign = campaignQuery.data
  const assignedAreas = assignedAreasQuery.data?.data ?? []
  const { boundaries: boundaryAreas, targets: targetAreas, unknown: unknownAreas } = splitCampaignAreasByUsage(assignedAreas)
  const assignedTeams = assignedTeamsQuery.data?.data ?? []
  const teamDetails = teamDetailsQuery.data ?? []
  const assignments = assignmentsQuery.data?.data ?? []
  const openAssignments = assignments.filter((assignment) => !isClosedAssignment(assignment))
  const campaignTeamIds = new Set(assignedTeams.map((team) => team.id))
  const leadTeams = uniqueTeams([
    ...leadTeamsByAssignedCampaign((userTeamsQuery.data ?? []) as UserTeam[], campaignTeamIds),
    ...leadTeamsFromCampaignTeams(assignedTeams, user?.id),
    ...leadTeamsFromCampaignTeams(teamDetails, user?.id),
  ])

  const claimAssignment = (assignment: Assignment) => {
    if (assignedTeamId(assignment) || isClosedAssignment(assignment) || leadTeams.length === 0) return
    if (leadTeams.length === 1) {
      assignAssignmentMutation.mutate({ assignmentId: assignment.id, teamId: leadTeams[0].id })
      return
    }
    const promptValue = window.prompt(`Team-ID auswählen (${leadTeams.map((team) => `${team.id}: ${team.name}`).join(', ')})`)
    if (!promptValue) return
    const teamId = Number(promptValue)
    if (!leadTeams.some((team) => team.id === teamId)) {
      window.alert('Ungültiges Team ausgewählt.')
      return
    }
    assignAssignmentMutation.mutate({ assignmentId: assignment.id, teamId })
  }

  const releaseAssignment = (assignment: Assignment) => {
    if (!isAssignedToLeadTeam(assignment, leadTeams) || isClosedAssignment(assignment)) return
    assignAssignmentMutation.mutate({ assignmentId: assignment.id, teamId: null })
  }

  return <section className="space-y-6">
    <Link to="/campaigns" className="text-sm text-blue-600">Zurück zur Kampagnenliste</Link>

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

    <div className="rounded border bg-white p-4">
      <details>
        <summary className="cursor-pointer font-medium">Karte</summary>
        <div className="mt-3">
          <CampaignAreaMap areas={assignedAreas} mapGeoJson={campaignAreasMapQuery.data} isLoading={assignedAreasQuery.isLoading} errorMessage={assignedAreasQuery.isError || campaignAreasMapQuery.isError ? `Karten-/Flächendaten konnten nicht geladen werden: ${message(assignedAreasQuery.error ?? campaignAreasMapQuery.error)}` : null} />
        </div>
      </details>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded border bg-white p-4 space-y-3">
        <h2 className="font-medium">Zugewiesene Fläche</h2>
        {assignedAreasQuery.isLoading && <LoadingState />}
        {assignedAreasQuery.isError && <ErrorState message={message(assignedAreasQuery.error)} />}
        {boundaryAreas.length === 0 && <EmptyState message="Noch keine Kampagnenfläche zugewiesen." />}
        {boundaryAreas.map((area) => <div key={area.id} className="rounded border p-2 text-sm"><Link className="font-medium text-blue-600" to={`/areas/${area.id}`}>{area.name}</Link><p className="text-slate-500">Flächen-ID: {area.id}</p></div>)}
      </div>
      <div className="rounded border bg-white p-4 space-y-3">
        <h2 className="font-medium">Zielgebiete</h2>
        {targetAreas.length === 0 && <EmptyState message="Noch keine Zielgebiete zugewiesen." />}
        {targetAreas.map((area) => <div key={area.id} className="rounded border p-2 text-sm"><Link className="font-medium text-blue-600" to={`/areas/${area.id}`}>{area.name}</Link>{area.pivot?.notes && <p className="text-slate-500">Notizen: {area.pivot.notes}</p>}</div>)}
        {unknownAreas.length > 0 && <p className="text-sm text-amber-700">Einige Flächen haben keine Nutzungsart.</p>}
      </div>
    </div>

    <div className="rounded border bg-white p-4 space-y-3">
      <h2 className="font-medium">Zugewiesene Teams</h2>
      {assignedTeamsQuery.isLoading && <LoadingState />}
      {assignedTeamsQuery.isError && <ErrorState message={message(assignedTeamsQuery.error)} />}
      {assignedTeams.length === 0 && <EmptyState message="Noch keine Teams zugewiesen." />}
      <div className="grid gap-2 md:grid-cols-2">{assignedTeams.map((team) => <div key={team.id} className="rounded border p-2 text-sm"><Link className="font-medium text-blue-600" to={`/teams/${team.id}`}>{team.name}</Link><p className="text-slate-500">Mitglieder: {team.users?.length ?? 'n/a'}</p></div>)}</div>
    </div>

    <div className="rounded border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Auftragsübersicht</h2>
        <div className="flex gap-3"><Link className="text-sm text-blue-600" to={`/campaigns/${id}/assignments`}>Alle Aufträge anzeigen</Link>{can(campaign.can?.create_assignment) && <Link className="text-sm text-blue-600" to={`/campaigns/${id}/assignments/new`}>Auftrag erstellen</Link>}</div>
      </div>
      {assignmentsQuery.isLoading && <LoadingState />}
      {assignmentsQuery.isError && <ErrorState message={message(assignmentsQuery.error)} />}
      <div className="grid gap-2 text-sm md:grid-cols-3">
        <div className="rounded bg-slate-50 p-3"><p className="text-slate-500">Gesamt</p><p className="text-2xl font-semibold">{assignments.length}</p></div>
        <div className="rounded bg-slate-50 p-3"><p className="text-slate-500">Offen/aktiv</p><p className="text-2xl font-semibold">{openAssignments.length}</p></div>
        <div className="rounded bg-slate-50 p-3"><p className="text-slate-500">Abgeschlossen</p><p className="text-2xl font-semibold">{assignments.filter((assignment) => assignment.status === 'completed').length}</p></div>
      </div>
      {assignments.length === 0 && <EmptyState message="Noch keine Aufträge vorhanden." />}
      {assignments.slice(0, 10).map((assignment) => {
        const teamId = assignedTeamId(assignment)
        const assignedToOwnTeam = isAssignedToLeadTeam(assignment, leadTeams)
        const closed = isClosedAssignment(assignment)
        const claimDisabled = Boolean(teamId) || closed || leadTeams.length === 0 || assignAssignmentMutation.isPending
        const releaseDisabled = !assignedToOwnTeam || closed || assignAssignmentMutation.isPending
        return (
          <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
            <div>
              <Link className="font-medium text-blue-600" to={`/assignments/${assignment.id}`}>{assignment.title}</Link>
              <p className="text-slate-500">{assignmentTypeLabel[assignment.type]} · {assignmentStatusLabel[assignment.status]} · Team: {assignment.team?.name ?? '-'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={claimDisabled} onClick={() => claimAssignment(assignment)}>Für Team übernehmen</button>
              <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={releaseDisabled} onClick={() => releaseAssignment(assignment)}>Zurückgeben</button>
            </div>
          </div>
        )
      })}
    </div>
  </section>
}
