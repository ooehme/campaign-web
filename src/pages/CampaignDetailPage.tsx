import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { attachAreaToCampaign, attachTeamToCampaign, createOrAttachAreaToCampaign, createOrAttachTeamToCampaign, detachAreaFromCampaign, detachTeamFromCampaign, getCampaign, getTasksPage, listAreas, listCampaignAreas, listCampaignAreasMap, listCampaignTeams, listTeams } from '../api/endpoints'
import { CampaignAreaMap } from '../components/CampaignAreaMap'
import { splitCampaignAreasByUsage } from '../utils/campaignAreaMap'
import { ApiError } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { can, canPermission, NO_PERMISSION_MESSAGE } from '../utils/permissions'
import type { Area, GeoJsonFeature, GeoJsonShape } from '../types/models'

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
  const [selectedArea, setSelectedArea] = useState('')
  const [selectedUsage, setSelectedUsage] = useState<'boundary' | 'target'>('boundary')
  const [selectedBoundaryAreaId, setSelectedBoundaryAreaId] = useState('')
  const [selectedNotes, setSelectedNotes] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [newAreaName, setNewAreaName] = useState('')
  const [newAreaUsage, setNewAreaUsage] = useState<'boundary' | 'target'>('boundary')
  const [newAreaBoundaryId, setNewAreaBoundaryId] = useState('')
  const [newAreaNotes, setNewAreaNotes] = useState('')
  const [newAreaGeojson, setNewAreaGeojson] = useState('{"type":"Polygon","coordinates":[]}')
  const [newTeamName, setNewTeamName] = useState('')
  const [success, setSuccess] = useState('')

  const campaignQuery = useQuery({ queryKey: ['campaign', id], queryFn: () => getCampaign(id), enabled: Number.isFinite(id) })
  const assignedAreasQuery = useQuery({ queryKey: ['campaign-areas', id], queryFn: () => listCampaignAreas(id, { per_page: 100 }), enabled: Number.isFinite(id) })
  const campaignAreasMapQuery = useQuery({ queryKey: ['campaign-areas-map', id], queryFn: () => listCampaignAreasMap(id), enabled: Number.isFinite(id) })
  const assignedTeamsQuery = useQuery({ queryKey: ['campaign-teams', id], queryFn: () => listCampaignTeams(id, { per_page: 100 }), enabled: Number.isFinite(id) })
  const areaPoolQuery = useQuery({ queryKey: ['areas-pool'], queryFn: () => listAreas({ per_page: 100 }) })
  const teamPoolQuery = useQuery({ queryKey: ['teams-pool'], queryFn: () => listTeams({ per_page: 100 }) })
  const tasksQuery = useQuery({ queryKey: ['tasks', id], queryFn: () => getTasksPage(id, { per_page: 100 }), enabled: Number.isFinite(id) })

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['campaigns'] })
    qc.invalidateQueries({ queryKey: ['campaign', id] })
    qc.invalidateQueries({ queryKey: ['campaign-areas', id] })
    qc.invalidateQueries({ queryKey: ['campaign-teams', id] })
    qc.invalidateQueries({ queryKey: ['areas-pool'] })
    qc.invalidateQueries({ queryKey: ['teams-pool'] })
  }

  const attachAreaMutation = useMutation({ mutationFn: (payload: { areaId: number; usage: 'boundary' | 'target'; boundary_area_id?: number | null; notes?: string | null }) => attachAreaToCampaign(id, payload.areaId, payload), onSuccess: () => { invalidateAll(); setSuccess('Fläche wurde zugewiesen.'); setSelectedArea(''); setSelectedBoundaryAreaId(''); setSelectedNotes('') } })
  const createAttachAreaMutation = useMutation({ mutationFn: (payload: { name: string; geojson: GeoJsonFeature; usage: 'boundary' | 'target'; boundary_area_id?: number | null; notes?: string | null }) => createOrAttachAreaToCampaign(id, payload), onSuccess: () => { invalidateAll(); setSuccess('Neue Fläche erstellt und zugewiesen.'); setNewAreaName(''); setNewAreaBoundaryId(''); setNewAreaNotes('') } })
  const detachAreaMutation = useMutation({ mutationFn: (areaId: number) => detachAreaFromCampaign(id, areaId), onSuccess: () => { invalidateAll(); setSuccess('Zuweisung entfernt.') } })

  const attachTeamMutation = useMutation({ mutationFn: (teamId: number) => attachTeamToCampaign(id, teamId), onSuccess: () => { invalidateAll(); setSuccess('Team wurde zugewiesen.'); setSelectedTeam('') } })
  const createAttachTeamMutation = useMutation({ mutationFn: (payload: { name: string }) => createOrAttachTeamToCampaign(id, payload), onSuccess: () => { invalidateAll(); setSuccess('Neues Team erstellt und zugewiesen.'); setNewTeamName('') } })
  const detachTeamMutation = useMutation({ mutationFn: (teamId: number) => detachTeamFromCampaign(id, teamId), onSuccess: () => { invalidateAll(); setSuccess('Zuweisung entfernt.') } })

  if (campaignQuery.isLoading) return <LoadingState />
  if (campaignQuery.isError || !campaignQuery.data) return <ErrorState message="Kampagne konnte nicht geladen werden." />
  const campaign = campaignQuery.data
  const assignedAreas = assignedAreasQuery.data?.data ?? []
  const { boundaries: boundaryAreas, targets: targetAreas, unknown: unknownAreas } = splitCampaignAreasByUsage(assignedAreas)

  return <section className="space-y-6">
    <Link to="/campaigns" className="text-sm text-blue-600">← Zurück zur Kampagnenliste</Link>
    <h1 className="text-3xl font-semibold">{campaign.name}</h1>
    {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}

    <div className="rounded border bg-white p-4"><h2 className="font-medium">Übersicht</h2><p>Status: {campaign.status ?? 'n/a'}</p><p>Slug: {campaign.slug ?? 'n/a'}</p><p>Start: {campaign.starts_at ?? 'n/a'}</p><p>Ende: {campaign.ends_at ?? 'n/a'}</p><p>Beschreibung: {campaign.description ?? '-'}</p></div>


    <CampaignAreaMap
      areas={assignedAreas}
      mapGeoJson={campaignAreasMapQuery.data}
      isLoading={assignedAreasQuery.isLoading}
      errorMessage={assignedAreasQuery.isError || campaignAreasMapQuery.isError ? `Karten-/Flächendaten konnten nicht geladen werden: ${message(assignedAreasQuery.error ?? campaignAreasMapQuery.error)}` : null}
    />

    <div className="rounded border bg-white p-4 space-y-3"><h2 className="font-medium">Fläche zuweisen</h2>
      {assignedAreasQuery.isLoading && <LoadingState />}
      {assignedAreasQuery.isError && <ErrorState message={message(assignedAreasQuery.error)} />}
      {areaPoolQuery.isLoading && <LoadingState />}
      {areaPoolQuery.isError && <ErrorState message={message(areaPoolQuery.error)} />}
      <div className="grid gap-2 md:grid-cols-2"><select value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)}><option value="">Fläche auswählen…</option>{(areaPoolQuery.data?.data ?? []).map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select>
      <select value={selectedUsage} onChange={(e) => setSelectedUsage(e.target.value as 'boundary' | 'target')}><option value="boundary">Begrenzung</option><option value="target">Zielgebiet</option></select></div>
      {selectedUsage === 'target' && <select value={selectedBoundaryAreaId} onChange={(e) => setSelectedBoundaryAreaId(e.target.value)}><option value="">Begrenzung auswählen (optional)</option>{boundaryAreas.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select>}
      <input value={selectedNotes} placeholder="Notizen (optional)" onChange={(e) => setSelectedNotes(e.target.value)} />
      <button className="border disabled:opacity-50" disabled={!canPermission(user?.can, 'campaigns.assign_areas') || !selectedArea} title={!canPermission(user?.can, 'campaigns.assign_areas') ? NO_PERMISSION_MESSAGE : undefined} onClick={() => selectedArea && attachAreaMutation.mutate({ areaId: Number(selectedArea), usage: selectedUsage, boundary_area_id: selectedBoundaryAreaId ? Number(selectedBoundaryAreaId) : null, notes: selectedNotes || null })}>Fläche zuweisen</button>

      <div className="grid gap-2 md:grid-cols-2"><input value={newAreaName} placeholder="Name neue Fläche" onChange={(e) => setNewAreaName(e.target.value)} /><select value={newAreaUsage} onChange={(e) => setNewAreaUsage(e.target.value as 'boundary' | 'target')}><option value="boundary">Begrenzung</option><option value="target">Zielgebiet</option></select></div>
      {newAreaUsage === 'target' && <select value={newAreaBoundaryId} onChange={(e) => setNewAreaBoundaryId(e.target.value)}><option value="">Begrenzung auswählen (optional)</option>{boundaryAreas.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select>}
      <input value={newAreaNotes} placeholder="Notizen (optional)" onChange={(e) => setNewAreaNotes(e.target.value)} />
      <div className="grid gap-2 md:grid-cols-2"><input value={newAreaGeojson} placeholder="GeoJSON" onChange={(e) => setNewAreaGeojson(e.target.value)} /><button className="border disabled:opacity-50" disabled={!can(campaign.can?.create_area)} title={!can(campaign.can?.create_area) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => { try { const parsed = JSON.parse(newAreaGeojson) as GeoJsonShape | GeoJsonFeature; const geometry = parsed?.type === 'Feature' ? parsed.geometry : parsed; if (!geometry || typeof geometry === 'string') throw new Error('invalid'); createAttachAreaMutation.mutate({ name: newAreaName, geojson: { type: 'Feature', geometry, properties: parsed?.type === 'Feature' ? parsed.properties : {} }, usage: newAreaUsage, boundary_area_id: newAreaBoundaryId ? Number(newAreaBoundaryId) : null, notes: newAreaNotes || null }) } catch { alert('Ungültige Geometrie: Bitte ein GeoJSON-Objekt (kein String) angeben.') } }}>Neue Fläche erstellen und zuweisen</button></div>
      <div><Link className="inline-block rounded border px-3 py-2 text-sm disabled:opacity-50" to={`/campaigns/${id}/areas/new-map`} aria-disabled={!can(campaign.can?.create_area)} onClick={(e) => { if (!can(campaign.can?.create_area)) e.preventDefault() }} title={!can(campaign.can?.create_area) ? NO_PERMISSION_MESSAGE : undefined}>Neue Fläche auf Karte erstellen und zuweisen</Link></div>

      <div className="grid gap-4 md:grid-cols-2"><div><h3 className="font-medium">Begrenzungen</h3>{boundaryAreas.length===0 && <EmptyState message="Noch keine Begrenzungen zugewiesen." />}{boundaryAreas.map((a: Area) => <div key={a.id} className="flex items-center justify-between rounded border p-2"><span>{a.name}</span><button className="bg-red-600 text-white disabled:opacity-50" disabled={!canPermission(user?.can, 'campaigns.assign_areas')} onClick={() => window.confirm('Zuweisung entfernen?') && detachAreaMutation.mutate(a.id)}>Zuweisung entfernen</button></div>)}</div>
      <div><h3 className="font-medium">Zielgebiete</h3>{targetAreas.length===0 && <EmptyState message="Noch keine Zielgebiete zugewiesen." />}{targetAreas.map((a: Area) => <div key={a.id} className="rounded border p-2"><div className="flex items-center justify-between"><span>{a.name}</span><button className="bg-red-600 text-white disabled:opacity-50" disabled={!canPermission(user?.can, 'campaigns.assign_areas')} onClick={() => window.confirm('Zuweisung entfernen?') && detachAreaMutation.mutate(a.id)}>Zuweisung entfernen</button></div>{a.pivot?.boundary_area_id && <p className="text-xs text-slate-500">Zugeordnete Begrenzung: {boundaryAreas.find((boundary) => boundary.id === a.pivot?.boundary_area_id)?.name ?? `ID ${a.pivot.boundary_area_id}`}</p>}{a.pivot?.notes && <p className="text-xs text-slate-500">Notizen: {a.pivot.notes}</p>}</div>)}</div></div>{unknownAreas.length > 0 && <p className="text-sm text-amber-700">Einige Flächen haben keine Nutzungsart.</p>}
    </div>

    <div className="rounded border bg-white p-4 space-y-3"><h2 className="font-medium">Zugewiesene Teams</h2>
      {assignedTeamsQuery.isLoading && <LoadingState />}
      {assignedTeamsQuery.isError && <ErrorState message={message(assignedTeamsQuery.error)} />}
      {teamPoolQuery.isLoading && <LoadingState />}
      {teamPoolQuery.isError && <ErrorState message={message(teamPoolQuery.error)} />}
      {assignedTeamsQuery.data?.data.length === 0 && <EmptyState message="Noch keine Teams zugewiesen." />}
      <div className="grid gap-2 md:grid-cols-3"><select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}><option value="">Team zuweisen…</option>{(teamPoolQuery.data?.data ?? []).map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select><button className="border disabled:opacity-50" disabled={!canPermission(user?.can, 'campaigns.assign_teams') || !selectedTeam} title={!canPermission(user?.can, 'campaigns.assign_teams') ? NO_PERMISSION_MESSAGE : undefined} onClick={() => selectedTeam && attachTeamMutation.mutate(Number(selectedTeam))}>Team zuweisen</button></div>
      <div className="grid gap-2 md:grid-cols-2"><input value={newTeamName} placeholder="Name neues Team" onChange={(e) => setNewTeamName(e.target.value)} /><button className="border disabled:opacity-50" disabled={!can(campaign.can?.create_team)} title={!can(campaign.can?.create_team) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => createAttachTeamMutation.mutate({ name: newTeamName })}>Neues Team erstellen und zuweisen</button></div>
      {(assignedTeamsQuery.data?.data ?? []).map((t) => <div key={t.id} className="flex items-center justify-between rounded border p-2"><Link className="text-blue-600" to="/teams">{t.name}</Link><button className="bg-red-600 text-white disabled:opacity-50" disabled={!canPermission(user?.can, 'campaigns.assign_teams')} title={!can(campaign.can?.detach_team) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm('Zuweisung entfernen?') && detachTeamMutation.mutate(t.id)}>Zuweisung entfernen</button></div>)}
    </div>

    <div className="rounded border bg-white p-4"><div className="mb-2 flex items-center justify-between"><h2 className="font-medium">Aufträge</h2><Link className="rounded border px-3 py-1 text-sm disabled:opacity-50" to={`/campaigns/${id}/tasks/new`} aria-disabled={!can(campaign.can?.create_task)} onClick={(e) => { if (!can(campaign.can?.create_task)) e.preventDefault() }} title={!can(campaign.can?.create_task) ? NO_PERMISSION_MESSAGE : undefined}>Auftrag erstellen</Link></div>{tasksQuery.isLoading && <LoadingState />}{tasksQuery.isError && <ErrorState message={message(tasksQuery.error)} />}{tasksQuery.data?.data.length === 0 && <EmptyState message="Noch keine Aufträge vorhanden." />}{(tasksQuery.data?.data ?? []).slice(0, 10).map((t) => <p key={t.id} className="text-sm">{t.title}</p>)}</div>
  </section>
}
