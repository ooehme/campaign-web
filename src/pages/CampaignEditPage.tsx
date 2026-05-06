import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { attachAreaToCampaign, attachTeamToCampaign, detachAreaFromCampaign, detachTeamFromCampaign, getCampaign, listAreas, listCampaignAreas, listCampaignAreasMap, listCampaignAssignments, listCampaignTeams, listTeams, updateCampaign } from '../api/endpoints'
import { ApiError } from '../api/client'
import { CampaignAreaMap } from '../components/CampaignAreaMap'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { getAreaGeometryBoundsSafely, splitCampaignAreasByUsage } from '../utils/campaignAreaMap'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'
import type { Area, Assignment, CampaignStatus } from '../types/models'

type TabKey = 'base' | 'area' | 'targets' | 'teams' | 'review'
type CheckState = 'ok' | 'warning' | 'error'

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'base', label: '1. Stammdaten' },
  { key: 'area', label: '2. Fläche' },
  { key: 'targets', label: '3. Zielgebiete' },
  { key: 'teams', label: '4. Teams' },
  { key: 'review', label: '5. Prüfung & Speichern' },
]

const statuses: CampaignStatus[] = ['draft', 'active', 'archived']

const message = (error: unknown) => {
  if (!(error instanceof ApiError)) return 'Unbekannter Fehler.'
  if (error.status === 401) return 'Nicht angemeldet (401).'
  if (error.status === 403) return 'Keine Berechtigung (403).'
  if (error.status === 422) return 'Validierung fehlgeschlagen (422).'
  if (error.status >= 500) return 'Serverfehler (500).'
  return error.message
}

const formatDateInput = (value?: string | null) => value ? value.slice(0, 10) : ''

const assignmentTeamCount = (assignments: Assignment[], teamId: number) =>
  assignments.filter((assignment) => assignment.teamId === teamId && assignment.status !== 'completed' && assignment.status !== 'cancelled').length

const boundsContainBounds = (boundary: [number, number][] | null, candidate: [number, number][] | null) => {
  if (!boundary || !candidate) return null
  const lats = boundary.map(([lat]) => lat)
  const lngs = boundary.map(([, lng]) => lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  return candidate.every(([lat, lng]) => lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng)
}

const areaWithinBoundary = (boundary: Area | undefined, area: Area) =>
  boundsContainBounds(getAreaGeometryBoundsSafely(boundary?.geojson), getAreaGeometryBoundsSafely(area.geojson))

function Badge({ state, children }: { state: CheckState; children: ReactNode }) {
  const classes = state === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : state === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'
  return <span className={`inline-flex rounded border px-2 py-1 text-xs font-medium ${classes}`}>{children}</span>
}

export function CampaignEditPage() {
  const { campaignId } = useParams()
  const id = Number(campaignId)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<TabKey>('base')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<CampaignStatus>('draft')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [areaSearch, setAreaSearch] = useState('')
  const [selectedBoundaryAreaId, setSelectedBoundaryAreaId] = useState('')
  const [targetSearch, setTargetSearch] = useState('')
  const [selectedTargetAreaId, setSelectedTargetAreaId] = useState('')
  const [teamSearch, setTeamSearch] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [dirtySections, setDirtySections] = useState<Record<TabKey, boolean>>({ base: false, area: false, targets: false, teams: false, review: false })

  const campaignQuery = useQuery({ queryKey: ['campaign', id], queryFn: () => getCampaign(id), enabled: Number.isFinite(id) })
  const assignedAreasQuery = useQuery({ queryKey: ['campaign-areas', id], queryFn: () => listCampaignAreas(id, { per_page: 100 }), enabled: Number.isFinite(id) })
  const campaignAreasMapQuery = useQuery({ queryKey: ['campaign-areas-map', id], queryFn: () => listCampaignAreasMap(id), enabled: Number.isFinite(id) })
  const assignedTeamsQuery = useQuery({ queryKey: ['campaign-teams', id], queryFn: () => listCampaignTeams(id, { per_page: 100 }), enabled: Number.isFinite(id) })
  const areaPoolQuery = useQuery({ queryKey: ['areas-pool'], queryFn: () => listAreas({ per_page: 100 }) })
  const teamPoolQuery = useQuery({ queryKey: ['teams-pool'], queryFn: () => listTeams({ per_page: 100 }) })
  const assignmentsQuery = useQuery({ queryKey: ['assignments', 'campaign', id], queryFn: () => listCampaignAssignments(id, { per_page: 100 }), enabled: Number.isFinite(id) })

  const campaign = campaignQuery.data
  const assignedAreas = assignedAreasQuery.data?.data ?? []
  const { boundaries: boundaryAreas, targets: targetAreas } = splitCampaignAreasByUsage(assignedAreas)
  const mainBoundary = boundaryAreas[0]
  const assignedTeams = assignedTeamsQuery.data?.data ?? []
  const assignments = assignmentsQuery.data?.data ?? []

  useEffect(() => {
    if (!campaign) return
    setName(campaign.name ?? '')
    setDescription(campaign.description ?? '')
    setStatus(campaign.status ?? 'draft')
    setStartsAt(formatDateInput(campaign.starts_at))
    setEndsAt(formatDateInput(campaign.ends_at))
    setDirtySections((current) => ({ ...current, base: false }))
  }, [campaign])

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['campaigns'] })
    qc.invalidateQueries({ queryKey: ['campaign', id] })
    qc.invalidateQueries({ queryKey: ['campaign-areas', id] })
    qc.invalidateQueries({ queryKey: ['campaign-areas-map', id] })
    qc.invalidateQueries({ queryKey: ['campaign-teams', id] })
    qc.invalidateQueries({ queryKey: ['areas-pool'] })
    qc.invalidateQueries({ queryKey: ['teams-pool'] })
    qc.invalidateQueries({ queryKey: ['assignments'] })
  }

  const saveBaseMutation = useMutation({
    mutationFn: () => updateCampaign(id, { name: name.trim(), description: description.trim() || null, status, starts_at: startsAt || null, ends_at: endsAt || null }),
    onSuccess: () => { invalidateAll(); setDirtySections((current) => ({ ...current, base: false })); setSuccess('Stammdaten wurden gespeichert.'); setError('') },
    onError: (mutationError) => { setError(message(mutationError)); setSuccess('') },
  })
  const attachBoundaryMutation = useMutation({ mutationFn: async (areaId: number) => { if (mainBoundary && mainBoundary.id !== areaId) await detachAreaFromCampaign(id, mainBoundary.id); return attachAreaToCampaign(id, areaId, { usage: 'boundary' }) }, onSuccess: () => { invalidateAll(); setSelectedBoundaryAreaId(''); setDirtySections((current) => ({ ...current, area: false })); setSuccess('Kampagnenfläche wurde gespeichert.'); setError('') }, onError: (mutationError) => { setError(message(mutationError)); setSuccess('') } })
  const removeBoundaryMutation = useMutation({ mutationFn: (areaId: number) => detachAreaFromCampaign(id, areaId), onSuccess: () => { invalidateAll(); setDirtySections((current) => ({ ...current, area: false })); setSuccess('Kampagnenfläche wurde entfernt.'); setError('') }, onError: (mutationError) => { setError(message(mutationError)); setSuccess('') } })
  const attachTargetMutation = useMutation({ mutationFn: (areaId: number) => attachAreaToCampaign(id, areaId, { usage: 'target', boundary_area_id: mainBoundary?.id ?? null }), onSuccess: () => { invalidateAll(); setSelectedTargetAreaId(''); setDirtySections((current) => ({ ...current, targets: false })); setSuccess('Zielgebiet wurde hinzugefügt.'); setError('') }, onError: (mutationError) => { setError(message(mutationError)); setSuccess('') } })
  const detachTargetMutation = useMutation({ mutationFn: (areaId: number) => detachAreaFromCampaign(id, areaId), onSuccess: () => { invalidateAll(); setSuccess('Zielgebiet wurde entfernt.'); setError('') }, onError: (mutationError) => { setError(message(mutationError)); setSuccess('') } })
  const attachTeamMutation = useMutation({ mutationFn: (teamId: number) => attachTeamToCampaign(id, teamId), onSuccess: () => { invalidateAll(); setSelectedTeamId(''); setDirtySections((current) => ({ ...current, teams: false })); setSuccess('Team wurde hinzugefügt.'); setError('') }, onError: (mutationError) => { setError(message(mutationError)); setSuccess('') } })
  const detachTeamMutation = useMutation({ mutationFn: (teamId: number) => detachTeamFromCampaign(id, teamId), onSuccess: () => { invalidateAll(); setSuccess('Team wurde entfernt.'); setError('') }, onError: (mutationError) => { setError(message(mutationError)); setSuccess('') } })

  const filteredAreas = useMemo(() => (areaPoolQuery.data?.data ?? []).filter((area) => area.name.toLowerCase().includes(areaSearch.toLowerCase())), [areaPoolQuery.data, areaSearch])
  const assignedAreaIds = useMemo(() => new Set(assignedAreas.map((area) => area.id)), [assignedAreas])
  const filteredTargetAreas = useMemo(() => filteredAreas.filter((area) => !assignedAreaIds.has(area.id)), [filteredAreas, assignedAreaIds])
  const assignedTeamIds = useMemo(() => new Set(assignedTeams.map((team) => team.id)), [assignedTeams])
  const filteredTeams = useMemo(() => (teamPoolQuery.data?.data ?? []).filter((team) => team.name.toLowerCase().includes(teamSearch.toLowerCase())), [teamPoolQuery.data, teamSearch])

  const targetChecks = targetAreas.map((area) => ({ area, within: areaWithinBoundary(mainBoundary, area) }))
  const outsideTargets = targetChecks.filter((check) => check.within === false)
  const unknownTargetChecks = targetChecks.filter((check) => check.within === null)
  const baseValid = name.trim().length > 0 && statuses.includes(status) && (!startsAt || !endsAt || startsAt <= endsAt)
  const setDirty = (section: TabKey, dirty = true) => setDirtySections((current) => ({ ...current, [section]: dirty }))
  const resetBase = () => { if (!campaign) return; setName(campaign.name ?? ''); setDescription(campaign.description ?? ''); setStatus(campaign.status ?? 'draft'); setStartsAt(formatDateInput(campaign.starts_at)); setEndsAt(formatDateInput(campaign.ends_at)); setDirty('base', false) }
  const leaveToDetail = () => navigate(`/campaigns/${id}`)

  if (!Number.isFinite(id)) return <ErrorState message="Ungültige Kampagnen-ID." />
  if (campaignQuery.isLoading) return <LoadingState />
  if (campaignQuery.isError || !campaign) return <ErrorState message="Kampagne konnte nicht geladen werden." />
  if (!can(campaign.can?.update)) return <ErrorState title="Bearbeitung nicht erlaubt" message="Ihr Konto darf diese Kampagne nicht bearbeiten." actionLabel="Zurück zur Kampagne" actionTo={`/campaigns/${id}`} />

  return <section className="space-y-6">
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div><Link to={`/campaigns/${id}`} className="text-sm text-blue-600">Zurück zur Kampagne</Link><h1 className="mt-2 text-3xl font-semibold">Kampagne bearbeiten</h1><p className="text-sm text-slate-600">{campaign.name}</p></div>
      <button className="rounded border px-4 py-2 text-sm" onClick={leaveToDetail}>Zurück zur Kampagne</button>
    </div>
    {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}
    {error && <ErrorState message={error} />}
    <nav className="flex flex-wrap gap-2 rounded border bg-white p-2">{tabs.map((tab) => <button key={tab.key} className={`rounded px-3 py-2 text-sm ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => setActiveTab(tab.key)}>{tab.label} {dirtySections[tab.key] ? '*' : ''}</button>)}</nav>

    {activeTab === 'base' && <div className="rounded border bg-white p-4 space-y-4"><div className="flex items-center justify-between"><h2 className="font-medium">Stammdaten</h2>{dirtySections.base ? <Badge state="warning">Ungespeicherte Änderungen</Badge> : <Badge state="ok">Gespeichert</Badge>}</div><label className="block text-sm">Name *<input className="mt-1 w-full rounded border p-2" value={name} onChange={(event) => { setName(event.target.value); setDirty('base') }} /></label><label className="block text-sm">Beschreibung<textarea className="mt-1 w-full rounded border p-2" rows={4} value={description} onChange={(event) => { setDescription(event.target.value); setDirty('base') }} /></label><label className="block text-sm">Status<select className="mt-1 w-full rounded border p-2" value={status} onChange={(event) => { setStatus(event.target.value as CampaignStatus); setDirty('base') }}>{statuses.map((allowedStatus) => <option key={allowedStatus} value={allowedStatus}>{allowedStatus}</option>)}</select></label><div className="grid gap-3 md:grid-cols-2"><label className="block text-sm">Startdatum<input className="mt-1 w-full rounded border p-2" type="date" value={startsAt} onChange={(event) => { setStartsAt(event.target.value); setDirty('base') }} /></label><label className="block text-sm">Enddatum<input className="mt-1 w-full rounded border p-2" type="date" value={endsAt} onChange={(event) => { setEndsAt(event.target.value); setDirty('base') }} /></label></div><div className="flex gap-2"><button className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!baseValid || saveBaseMutation.isPending} onClick={() => saveBaseMutation.mutate()}>Änderungen speichern</button><button className="rounded border px-4 py-2 text-sm" onClick={resetBase}>Änderungen verwerfen</button></div></div>}
    {activeTab === 'area' && <div className="rounded border bg-white p-4 space-y-4"><h2 className="font-medium">Fläche zuweisen</h2><CampaignAreaMap areas={assignedAreas} mapGeoJson={campaignAreasMapQuery.data} isLoading={assignedAreasQuery.isLoading} errorMessage={assignedAreasQuery.isError || campaignAreasMapQuery.isError ? message(assignedAreasQuery.error ?? campaignAreasMapQuery.error) : null} /><div className="rounded border p-3 text-sm"><h3 className="font-medium">Aktuell zugewiesene Fläche</h3>{mainBoundary ? <p>{mainBoundary.name}</p> : <EmptyState message="Noch keine Kampagnenfläche zugewiesen." />}</div><label className="block text-sm">Fläche suchen<input className="mt-1 w-full rounded border p-2" value={areaSearch} onChange={(event) => setAreaSearch(event.target.value)} placeholder="Name" /></label><select className="w-full rounded border p-2" value={selectedBoundaryAreaId} onChange={(event) => { setSelectedBoundaryAreaId(event.target.value); setDirty('area') }}><option value="">Fläche auswählen...</option>{filteredAreas.map((area) => <option key={area.id} value={area.id}>{area.name} (ID {area.id})</option>)}</select><BoundaryChecks outsideTargets={outsideTargets} unknownTargetChecks={unknownTargetChecks} /><div className="flex flex-wrap gap-2"><button className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!can(campaign.can?.attach_area) || !selectedBoundaryAreaId || attachBoundaryMutation.isPending} title={!can(campaign.can?.attach_area) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => attachBoundaryMutation.mutate(Number(selectedBoundaryAreaId))}>Fläche speichern/wechseln</button>{mainBoundary && <button className="rounded border border-red-300 px-4 py-2 text-sm text-red-700 disabled:opacity-50" disabled={!can(campaign.can?.detach_area) || removeBoundaryMutation.isPending} onClick={() => window.confirm('Kampagnenfläche entfernen?') && removeBoundaryMutation.mutate(mainBoundary.id)}>Fläche entfernen</button>}</div></div>}
    {activeTab === 'targets' && <div className="rounded border bg-white p-4 space-y-4"><h2 className="font-medium">Zielgebiete verwalten</h2><label className="block text-sm">Zielgebiet suchen<input className="mt-1 w-full rounded border p-2" value={targetSearch} onChange={(event) => setTargetSearch(event.target.value)} placeholder="Name" /></label><select className="w-full rounded border p-2" value={selectedTargetAreaId} onChange={(event) => { setSelectedTargetAreaId(event.target.value); setDirty('targets') }}><option value="">Zielgebiet auswählen...</option>{filteredTargetAreas.filter((area) => area.name.toLowerCase().includes(targetSearch.toLowerCase())).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select><button className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!can(campaign.can?.attach_area) || !selectedTargetAreaId || attachTargetMutation.isPending} onClick={() => attachTargetMutation.mutate(Number(selectedTargetAreaId))}>Zielgebiet hinzufügen</button>{targetAreas.length === 0 && <EmptyState message="Noch keine Zielgebiete zugewiesen." />}<div className="grid gap-2">{targetAreas.map((area) => { const within = areaWithinBoundary(mainBoundary, area); return <div key={area.id} className={`rounded border p-3 text-sm ${within === false ? 'border-red-300 bg-red-50' : ''}`}><div className="flex items-start justify-between gap-2"><div><Link className="font-medium text-blue-600" to={`/areas/${area.id}`}>{area.name}</Link>{within === false ? <Badge state="error">außerhalb der Kampagnenfläche</Badge> : within === true ? <Badge state="ok">innerhalb</Badge> : <Badge state="warning">Prüfung nicht verfügbar</Badge>}</div><button className="rounded border border-red-300 px-3 py-1 text-red-700 disabled:opacity-50" disabled={!can(campaign.can?.detach_area) || detachTargetMutation.isPending} onClick={() => window.confirm('Zielgebiet entfernen?') && detachTargetMutation.mutate(area.id)}>Zielgebiet entfernen</button></div></div> })}</div></div>}
    {activeTab === 'teams' && <div className="rounded border bg-white p-4 space-y-4"><h2 className="font-medium">Teams zuweisen</h2><label className="block text-sm">Team suchen<input className="mt-1 w-full rounded border p-2" value={teamSearch} onChange={(event) => setTeamSearch(event.target.value)} placeholder="Teamname" /></label><select className="w-full rounded border p-2" value={selectedTeamId} onChange={(event) => { setSelectedTeamId(event.target.value); setDirty('teams') }}><option value="">Team auswählen...</option>{filteredTeams.map((team) => <option key={team.id} value={team.id} disabled={assignedTeamIds.has(team.id)}>{team.name}{assignedTeamIds.has(team.id) ? ' (bereits zugewiesen)' : ''}</option>)}</select><button className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!can(campaign.can?.attach_team) || !selectedTeamId || attachTeamMutation.isPending} onClick={() => attachTeamMutation.mutate(Number(selectedTeamId))}>Team hinzufügen</button>{assignedTeams.length === 0 && <EmptyState message="Noch keine Teams zugewiesen." />}<div className="grid gap-2">{assignedTeams.map((team) => { const openAssignments = assignmentTeamCount(assignments, team.id); return <div key={team.id} className="rounded border p-3 text-sm"><div className="flex items-start justify-between gap-2"><div><Link className="font-medium text-blue-600" to={`/teams/${team.id}`}>{team.name}</Link><p className="text-slate-500">Mitglieder: {team.users?.length ?? 'n/a'}</p><p className="text-slate-500">Offene Aufträge: {openAssignments} · Übernommene Aufträge: {assignments.filter((assignment) => assignment.teamId === team.id).length}</p>{openAssignments > 0 && <p className="text-amber-800">Dieses Team hat noch zugewiesene Aufträge in dieser Kampagne.</p>}</div><button className="rounded border border-red-300 px-3 py-1 text-red-700 disabled:opacity-50" disabled={!can(campaign.can?.detach_team) || detachTeamMutation.isPending} onClick={() => (openAssignments === 0 || window.confirm('Dieses Team hat noch zugewiesene Aufträge in dieser Kampagne. Trotzdem entfernen?')) && detachTeamMutation.mutate(team.id)}>Team entfernen</button></div></div> })}</div></div>}
    {activeTab === 'review' && <div className="rounded border bg-white p-4 space-y-4"><h2 className="font-medium">Prüfung & Speichern</h2><ReviewRow label="Stammdaten vollständig" state={baseValid ? 'ok' : 'error'} detail={baseValid ? 'OK' : 'Name, Status oder Datumslogik prüfen.'} /><ReviewRow label="Kampagnenfläche" state={mainBoundary ? 'ok' : 'warning'} detail={mainBoundary ? mainBoundary.name : 'Keine Kampagnenfläche gesetzt.'} /><ReviewRow label="Zielgebiete innerhalb der Fläche" state={outsideTargets.length ? 'error' : unknownTargetChecks.length ? 'warning' : 'ok'} detail={outsideTargets.length ? `${outsideTargets.length} Zielgebiet(e) außerhalb.` : unknownTargetChecks.length ? 'Einige Zielgebiete konnten nicht geprüft werden.' : 'Alle Zielgebiete liegen innerhalb der Kampagnenfläche.'} /><ReviewRow label="Teams zugewiesen" state={assignedTeams.length ? 'ok' : 'warning'} detail={assignedTeams.length ? `${assignedTeams.length} Team(s)` : 'Noch keine Teams zugewiesen.'} /><div className="flex flex-wrap gap-2"><button className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!baseValid || saveBaseMutation.isPending} onClick={() => saveBaseMutation.mutate()}>Änderungen speichern</button><button className="rounded border px-4 py-2 text-sm" onClick={leaveToDetail}>zurück zur Kampagne</button><button className="rounded border px-4 py-2 text-sm" onClick={resetBase}>Änderungen verwerfen</button></div></div>}
  </section>
}

function BoundaryChecks({ outsideTargets, unknownTargetChecks }: { outsideTargets: Array<{ area: Area }>; unknownTargetChecks: Array<{ area: Area }> }) {
  return <div className="rounded border p-3 text-sm space-y-2"><h3 className="font-medium">Begrenzungen</h3>{outsideTargets.length === 0 ? <p className="text-emerald-700">Alle Zielgebiete liegen innerhalb der Kampagnenfläche.</p> : <p className="text-red-700">Einige Zielgebiete liegen außerhalb der Kampagnenfläche.</p>}{unknownTargetChecks.length > 0 && <p className="text-amber-800">Einige Begrenzungsprüfungen konnten mit den verfügbaren API-Daten nicht vollständig durchgeführt werden.</p>}</div>
}

function ReviewRow({ label, state, detail }: { label: string; state: CheckState; detail: string }) {
  return <div className="flex items-center justify-between gap-3 rounded border p-3 text-sm"><div><p className="font-medium">{label}</p><p className="text-slate-600">{detail}</p></div><Badge state={state}>{state === 'ok' ? 'OK' : state === 'warning' ? 'Warnung' : 'Fehler'}</Badge></div>
}
