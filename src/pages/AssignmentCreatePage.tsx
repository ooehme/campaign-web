import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import { ApiError } from '../api/client'
import { createAssignment, createCampaignAssignment, getCampaign, getTeam, listCampaigns, listCampaignAreas, listCampaignTeams, listUserTeams } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { AssignmentBuildingSelector } from '../components/AssignmentBuildingSelector'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { ASSIGNMENT_STATUSES, ASSIGNMENT_TYPES, MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'
import { assignmentTypeLabel, uniqueCampaigns } from '../utils/assignment'
import { getAreaGeometryBoundsSafely, getAreaUsageOptions, getGeometryFromAreaGeoJson, isValidPolygonOrMultiPolygon } from '../utils/campaignAreaMap'
import { can, NO_PERMISSION_MESSAGE } from '../utils/permissions'
import type { Area, Assignment, Campaign, Team, UserTeam } from '../types/models'

const deliveryModes = ['letterbox', 'doorstep', 'both'] as const
const householdTargets = ['all_households', 'selected_buildings'] as const
const proofTypes = ['photo', 'gps_track', 'completion_checklist'] as const
const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]
const CAMPAIGN_POOL_ACCESS_ROLES = new Set(['admin', 'manager', 'app-admin', 'campaign-manager'])

const splitLines = (value?: string) => (value ?? '').split('\n').map((line) => line.trim()).filter(Boolean)

const formSchema = z.object({
  type: z.enum(ASSIGNMENT_TYPES),
  title: z.string().min(1, 'Titel ist erforderlich.'),
  description: z.string().optional(),
  boundaryAreaId: z.string().min(1, 'Begrenzungsgebiet ist erforderlich.'),
  targetAreaId: z.string().min(1, 'Zielgebiet ist erforderlich.'),
  teamId: z.string().optional(),
  startsAt: z.string().optional(),
  dueAt: z.string().optional(),
  status: z.enum(ASSIGNMENT_STATUSES),
  mandatoryInstructions: z.string().optional(),
  materialName: z.string().optional(),
  estimatedQuantity: z.string().optional(),
  deliveryMode: z.enum(deliveryModes).optional(),
  householdTargeting: z.enum(householdTargets).optional(),
  avoidDuplicateDelivery: z.boolean().optional(),
  requireNoAdsStickerRespect: z.boolean().optional(),
  proofRequired: z.boolean().optional(),
  proofTypes: z.array(z.enum(proofTypes)).optional(),
  notesForTeam: z.string().optional(),
  posterName: z.string().optional(),
  estimatedPosterCount: z.string().optional(),
  requirePhotoProof: z.boolean().optional(),
}).superRefine((value, ctx) => {
  const instructions = splitLines(value.mandatoryInstructions)
  if (value.type === 'letterbox_distribution') {
    if (!value.materialName?.trim()) ctx.addIssue({ code: 'custom', path: ['materialName'], message: 'Materialname ist erforderlich.' })
    if (instructions.length === 0) ctx.addIssue({ code: 'custom', path: ['mandatoryInstructions'], message: 'Mindestens eine Anweisung ist erforderlich.' })
    if (!value.deliveryMode) ctx.addIssue({ code: 'custom', path: ['deliveryMode'], message: 'Verteilmodus ist erforderlich.' })
    if (!value.householdTargeting) ctx.addIssue({ code: 'custom', path: ['householdTargeting'], message: 'Haushaltsauswahl ist erforderlich.' })
  }
  if (value.type === 'poster_free' || value.type === 'poster_guided') {
    if (!value.posterName?.trim()) ctx.addIssue({ code: 'custom', path: ['posterName'], message: 'Plakatname ist erforderlich.' })
    if (instructions.length === 0) ctx.addIssue({ code: 'custom', path: ['mandatoryInstructions'], message: 'Mindestens eine Anweisung ist erforderlich.' })
  }
})

type FormValues = z.infer<typeof formSchema>

function FitTargetAreaBounds({ bounds }: { bounds: [number, number][] | null }) {
  const map = useMap()
  useEffect(() => {
    if (bounds?.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 })
  }, [bounds, map])
  return null
}

function TargetAreaPreviewMap({ area }: { area: Area }) {
  const geometry = getGeometryFromAreaGeoJson(area.geojson)
  const bounds = getAreaGeometryBoundsSafely(area.geojson)
  const validGeometry = isValidPolygonOrMultiPolygon(area.geojson)

  if (!validGeometry || !geometry || !bounds) {
    return <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Für dieses Zielgebiet ist keine gültige Kartengeometrie verfügbar.</p>
  }

  return (
    <div className="space-y-2 rounded border bg-slate-50 p-3">
      <h2 className="font-medium">Zielgebiet-Vorschau</h2>
      <div className="h-72 overflow-hidden rounded border bg-white">
        <MapContainer center={DEFAULT_CENTER} zoom={6} className="h-full w-full">
          <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
          <GeoJSON key={area.id} data={geometry as GeoJSON.GeoJsonObject} style={{ color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.22, weight: 3 }} />
          <FitTargetAreaBounds bounds={bounds} />
        </MapContainer>
      </div>
    </div>
  )
}

const buildTypeConfig = (values: FormValues): Assignment['typeConfig'] => {
  const mandatoryInstructions = splitLines(values.mandatoryInstructions)
  if (values.type === 'letterbox_distribution') {
    return {
      mandatoryInstructions,
      materialName: values.materialName?.trim() ?? '',
      estimatedQuantity: values.estimatedQuantity ? Number(values.estimatedQuantity) : undefined,
      deliveryMode: values.deliveryMode ?? 'letterbox',
      householdTargeting: values.householdTargeting ?? 'all_households',
      avoidDuplicateDelivery: Boolean(values.avoidDuplicateDelivery),
      requireNoAdsStickerRespect: Boolean(values.requireNoAdsStickerRespect),
      proofRequired: Boolean(values.proofRequired),
      proofTypes: values.proofTypes ?? [],
      notesForTeam: values.notesForTeam?.trim() || undefined,
    }
  }
  if (values.type === 'poster_free') {
    return {
      posterName: values.posterName?.trim() ?? '',
      estimatedPosterCount: values.estimatedPosterCount ? Number(values.estimatedPosterCount) : undefined,
      mandatoryInstructions,
      allowTeamToCreateLocations: true,
      requirePhotoProof: Boolean(values.requirePhotoProof),
    }
  }
  if (values.type === 'poster_guided') {
    return {
      posterName: values.posterName?.trim() ?? '',
      mandatoryInstructions,
      allowTeamToCreateLocations: false,
      requirePhotoProof: Boolean(values.requirePhotoProof),
    }
  }
  return {}
}

export function AssignmentCreatePage() {
  const { campaignId } = useParams()
  const routeCampaign = campaignId ? Number(campaignId) : null
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [topError, setTopError] = useState<string | null>(null)
  const [selectedCampaignId, setSelectedCampaignId] = useState(() => Number.isFinite(routeCampaign) ? String(routeCampaign) : '')
  const [areaBuildingIds, setAreaBuildingIds] = useState<number[]>([])
  const hasCampaignPoolAccess = CAMPAIGN_POOL_ACCESS_ROLES.has(String(user?.app_role ?? ''))
  const selectedCampaign = selectedCampaignId ? Number(selectedCampaignId) : null

  const campaignPoolQuery = useQuery({ queryKey: ['campaigns', 'assignment-create'], queryFn: () => listCampaigns({ per_page: 100 }), enabled: hasCampaignPoolAccess, retry: false })
  const campaignQuery = useQuery({ queryKey: ['campaign', selectedCampaign], queryFn: () => getCampaign(selectedCampaign!), enabled: Number.isFinite(selectedCampaign), retry: false })
  const userTeamsQuery = useQuery({ queryKey: ['assignment-create-user-teams', user?.id], queryFn: () => listUserTeams(user!.id), enabled: Boolean(user?.id && !hasCampaignPoolAccess), retry: false })
  const teamDetailsQuery = useQuery({
    queryKey: ['assignment-create-team-details', userTeamsQuery.data?.map((team) => team.id).join(',')],
    queryFn: async () => {
      const results = await Promise.allSettled((userTeamsQuery.data ?? []).map((team) => getTeam(team.id)))
      return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
    },
    enabled: Boolean(!hasCampaignPoolAccess && userTeamsQuery.data?.length),
    retry: false,
  })
  const areasQuery = useQuery({ queryKey: ['campaign-areas', selectedCampaign], queryFn: () => listCampaignAreas(selectedCampaign!, { per_page: 100 }), enabled: Number.isFinite(selectedCampaign), retry: false })
  const teamsQuery = useQuery({ queryKey: ['campaign-teams', selectedCampaign], queryFn: () => listCampaignTeams(selectedCampaign!, { per_page: 100 }), enabled: Number.isFinite(selectedCampaign), retry: false })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: 'standard',
      title: '',
      description: '',
      boundaryAreaId: '',
      targetAreaId: '',
      teamId: '',
      startsAt: '',
      dueAt: '',
      status: 'draft',
      mandatoryInstructions: '',
      materialName: '',
      deliveryMode: 'letterbox',
      householdTargeting: 'all_households',
      proofTypes: [],
      posterName: '',
    },
  })
  const type = form.watch('type')
  const selectedTargetAreaId = form.watch('targetAreaId')
  const householdTargeting = form.watch('householdTargeting')
  const selectedProofTypes = form.watch('proofTypes') ?? []
  const teamDetails = (teamDetailsQuery.data ?? []) as Team[]
  const leadTeamCampaigns = ((userTeamsQuery.data ?? []) as UserTeam[])
    .map((team) => {
      const detail = teamDetails.find((item) => item.id === team.id)
      return {
        ...team,
        campaigns: team.campaigns ?? detail?.campaigns,
        pivot: team.pivot ?? detail?.users?.find((member) => member.id === user?.id)?.pivot,
      }
    })
    .filter((team) => team.pivot?.role === 'lead')
    .flatMap((team) => team.campaigns ?? [])
  const availableCampaigns = uniqueCampaigns([
    ...(hasCampaignPoolAccess ? campaignPoolQuery.data?.data ?? [] : [...(user?.campaigns ?? []), ...leadTeamCampaigns]),
    ...(campaignQuery.data ? [campaignQuery.data] : []),
  ] as Campaign[])
  const canCreate = selectedCampaign ? (campaignQuery.data ? can(campaignQuery.data.can?.create_assignment) : true) : false
  const campaignSelectionLoading = hasCampaignPoolAccess ? campaignPoolQuery.isLoading : userTeamsQuery.isLoading || teamDetailsQuery.isLoading
  const campaignSelectionError = hasCampaignPoolAccess ? campaignPoolQuery.isError : userTeamsQuery.isError || teamDetailsQuery.isError
  const availableAreas = areasQuery.data?.data ?? []
  const areasLoading = areasQuery.isLoading
  const areasError = areasQuery.isError
  const boundaryAreaOptions = getAreaUsageOptions(availableAreas, 'boundary')
  const targetAreaOptions = getAreaUsageOptions(availableAreas, 'target')
  const selectedTargetOption = targetAreaOptions.find((option) => String(option.area.id) === selectedTargetAreaId)
  const selectedTarget = selectedTargetOption?.area

  useEffect(() => {
    if (selectedCampaignId || availableCampaigns.length === 0) return
    setSelectedCampaignId(String(availableCampaigns[0].id))
  }, [availableCampaigns, selectedCampaignId])

  useEffect(() => {
    form.setValue('boundaryAreaId', '')
    form.setValue('targetAreaId', '')
    form.setValue('teamId', '')
    setAreaBuildingIds([])
  }, [form, selectedCampaignId])

  useEffect(() => {
    if (householdTargeting !== 'selected_buildings' || areaBuildingIds.length > 0) form.clearErrors('householdTargeting')
  }, [areaBuildingIds.length, form, householdTargeting])

  const requestPayload = (values: FormValues): Partial<Assignment> & Record<string, unknown> => {
    const payload: Partial<Assignment> & Record<string, unknown> = {
      type: values.type,
      title: values.title,
      description: values.description || null,
      campaign_id: selectedCampaign,
      boundary_area_id: Number(values.boundaryAreaId),
      target_area_id: Number(values.targetAreaId),
      team_id: values.teamId ? Number(values.teamId) : null,
      starts_at: values.startsAt || null,
      due_at: values.dueAt || null,
      status: values.status,
      type_config: buildTypeConfig(values),
    }
    if (values.type === 'letterbox_distribution') {
      payload.area_building_ids = values.householdTargeting === 'selected_buildings' ? areaBuildingIds : []
    }
    return payload
  }

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = requestPayload(values)
      if (!selectedCampaign) throw new Error('campaign-required')
      return createCampaignAssignment(selectedCampaign, payload).catch((error) => {
        if (error instanceof ApiError && error.status === 404) return createAssignment(payload)
        throw error
      })
    },
    onSuccess: (assignment) => {
      qc.invalidateQueries({ queryKey: ['assignments'] })
      if (selectedCampaign) qc.invalidateQueries({ queryKey: ['campaign', selectedCampaign] })
      navigate(assignment?.id ? `/assignments/${assignment.id}` : (selectedCampaign ? `/campaigns/${selectedCampaign}/assignments` : '/assignments'))
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 403) setTopError('Keine Berechtigung für diese Aktion.')
      else if (error instanceof ApiError && error.status === 422) setTopError('Bitte prüfen Sie die Formularfelder.')
      else setTopError('Auftrag konnte nicht gespeichert werden.')
    },
  })

  const proofOptions = useMemo(() => proofTypes.map((proofType) => ({
    key: proofType,
    checked: selectedProofTypes.includes(proofType),
  })), [selectedProofTypes])

  if (selectedCampaign && campaignQuery.isLoading) return <LoadingState />
  if (campaignQuery.isError) return <ErrorState message="Kampagne konnte nicht geladen werden." />
  if (selectedCampaign && campaignQuery.data && !canCreate) {
    return <ErrorState title="Auftrag erstellen nicht erlaubt" message="Ihr Konto darf in dieser Kampagne keine Aufträge erstellen." actionLabel="Zurück zur Kampagne" actionTo={`/campaigns/${selectedCampaign}`} />
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Auftrag erstellen</h1>
        <Link className="text-blue-600" to={selectedCampaign ? `/campaigns/${selectedCampaign}` : '/assignments'}>Zurück</Link>
      </div>
      {topError && <ErrorState message={topError} />}
      {campaignSelectionError && <ErrorState message="Kampagnen konnten nicht geladen werden." />}
      {!campaignSelectionLoading && availableCampaigns.length === 0 && <EmptyState message="Keine Kampagnen verfügbar." />}
      {areasError && <ErrorState message="Gebiete konnten nicht geladen werden." />}
      {selectedCampaign && !areasLoading && boundaryAreaOptions.length === 0 && <EmptyState message="Keine Begrenzungsgebiete für diese Kampagne verfügbar." />}
      {selectedCampaign && !areasLoading && targetAreaOptions.length === 0 && <EmptyState message="Keine Zielgebiete für diese Kampagne verfügbar." />}
      {selectedCampaign && !teamsQuery.isLoading && (teamsQuery.data?.data ?? []).length === 0 && <EmptyState message="Keine Teams für diese Kampagne zugewiesen." />}
      <form className="space-y-3 rounded border bg-white p-4" onSubmit={form.handleSubmit((values) => {
        if (values.type === 'letterbox_distribution' && values.householdTargeting === 'selected_buildings' && areaBuildingIds.length === 0) {
          form.setError('householdTargeting', { type: 'custom', message: 'Bitte mindestens ein Gebäude auswählen.' })
          return
        }
        createMutation.mutate(values)
      })}>
        <label className="block text-sm">Kampagne *<select className="mt-1" value={selectedCampaignId} onChange={(event) => setSelectedCampaignId(event.target.value)} disabled={campaignSelectionLoading}><option value="">Kampagne auswählen</option>{availableCampaigns.map((availableCampaign) => <option key={availableCampaign.id} value={availableCampaign.id}>{availableCampaign.name}</option>)}</select></label>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="block text-sm">Typ *<select className="mt-1" {...form.register('type')} disabled={!canCreate}>{ASSIGNMENT_TYPES.map((entry) => <option key={entry} value={entry}>{assignmentTypeLabel[entry]}</option>)}</select></label>
          <label className="block text-sm">Status<select className="mt-1" {...form.register('status')} disabled={!canCreate}>{ASSIGNMENT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
        </div>
        <input placeholder="Titel *" {...form.register('title')} disabled={!canCreate} title={!canCreate ? NO_PERMISSION_MESSAGE : undefined} />
        {form.formState.errors.title?.message && <ErrorState message={form.formState.errors.title.message} />}
        <textarea rows={3} placeholder="Beschreibung" {...form.register('description')} disabled={!canCreate} />
        <div className="grid gap-2 md:grid-cols-2">
          <label className="block text-sm">Begrenzungsgebiet *<select className="mt-1" {...form.register('boundaryAreaId')} disabled={!canCreate || areasLoading}><option value="">Begrenzungsgebiet auswählen</option>{boundaryAreaOptions.map(({ area }) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
          <label className="block text-sm">Zielgebiet *<select className="mt-1" {...form.register('targetAreaId')} disabled={!canCreate || areasLoading} onChange={(event) => { form.setValue('targetAreaId', event.target.value); setAreaBuildingIds([]); const boundaryAreaId = targetAreaOptions.find((option) => String(option.area.id) === event.target.value)?.boundaryAreaId; if (boundaryAreaId) form.setValue('boundaryAreaId', String(boundaryAreaId)) }}><option value="">Zielgebiet auswählen</option>{targetAreaOptions.map(({ area }) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
        </div>
        {form.formState.errors.boundaryAreaId?.message && <ErrorState message={form.formState.errors.boundaryAreaId.message} />}
        {form.formState.errors.targetAreaId?.message && <ErrorState message={form.formState.errors.targetAreaId.message} />}
        {selectedTargetOption?.boundaryAreaId && String(selectedTargetOption.boundaryAreaId) !== form.watch('boundaryAreaId') && <p className="text-sm text-amber-700">Das Zielgebiet gehört nicht zum ausgewählten Begrenzungsgebiet.</p>}
        {selectedTarget && <TargetAreaPreviewMap area={selectedTarget} />}
        <div className="grid gap-2 md:grid-cols-3">
          <select {...form.register('teamId')} disabled={!canCreate}><option value="">Team</option>{(teamsQuery.data?.data ?? []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
          <input type="datetime-local" {...form.register('startsAt')} disabled={!canCreate} />
          <input type="datetime-local" {...form.register('dueAt')} disabled={!canCreate} />
        </div>

        {type !== 'standard' && (
          <div className="space-y-3 rounded border p-3">
            <textarea rows={4} placeholder="Pflichtanweisungen, eine pro Zeile *" {...form.register('mandatoryInstructions')} disabled={!canCreate} />
            {form.formState.errors.mandatoryInstructions?.message && <ErrorState message={form.formState.errors.mandatoryInstructions.message} />}
            {type === 'letterbox_distribution' && (
              <>
                <div className="grid gap-2 md:grid-cols-2">
                  <input placeholder="Materialname *" {...form.register('materialName')} disabled={!canCreate} />
                  <input type="number" placeholder="Geschätzte Menge" {...form.register('estimatedQuantity')} disabled={!canCreate} />
                </div>
                {form.formState.errors.materialName?.message && <ErrorState message={form.formState.errors.materialName.message} />}
                <div className="grid gap-2 md:grid-cols-2">
                  <select {...form.register('deliveryMode')} disabled={!canCreate}>{deliveryModes.map((entry) => <option key={entry}>{entry}</option>)}</select>
                  <select {...form.register('householdTargeting')} disabled={!canCreate}>{householdTargets.map((entry) => <option key={entry}>{entry}</option>)}</select>
                </div>
                {form.formState.errors.householdTargeting?.message && <ErrorState message={form.formState.errors.householdTargeting.message} />}
                {selectedTarget && <AssignmentBuildingSelector targetArea={selectedTarget} householdTargeting={householdTargeting} selectedIds={areaBuildingIds} onSelectedIdsChange={setAreaBuildingIds} disabled={!canCreate} />}
                <label className="flex gap-2 text-sm"><input type="checkbox" {...form.register('avoidDuplicateDelivery')} disabled={!canCreate} /> Doppelte Zustellung vermeiden</label>
                <label className="flex gap-2 text-sm"><input type="checkbox" {...form.register('requireNoAdsStickerRespect')} disabled={!canCreate} /> Keine-Werbung-Aufkleber beachten</label>
                <label className="flex gap-2 text-sm"><input type="checkbox" {...form.register('proofRequired')} disabled={!canCreate} /> Nachweis erforderlich</label>
                <div className="flex flex-wrap gap-3 text-sm">{proofOptions.map((option) => <label key={option.key} className="flex gap-2"><input type="checkbox" checked={option.checked} onChange={(event) => form.setValue('proofTypes', event.target.checked ? [...selectedProofTypes, option.key] : selectedProofTypes.filter((entry) => entry !== option.key))} disabled={!canCreate} /> {option.key}</label>)}</div>
                <textarea rows={3} placeholder="Notizen für Team" {...form.register('notesForTeam')} disabled={!canCreate} />
              </>
            )}
            {(type === 'poster_free' || type === 'poster_guided') && (
              <>
                <div className="grid gap-2 md:grid-cols-2">
                  <input placeholder="Plakatname *" {...form.register('posterName')} disabled={!canCreate} />
                  {type === 'poster_free' && <input type="number" placeholder="Geschätzte Plakatanzahl" {...form.register('estimatedPosterCount')} disabled={!canCreate} />}
                </div>
                {form.formState.errors.posterName?.message && <ErrorState message={form.formState.errors.posterName.message} />}
                <label className="flex gap-2 text-sm"><input type="checkbox" {...form.register('requirePhotoProof')} disabled={!canCreate} /> Foto-Nachweis erforderlich</label>
              </>
            )}
          </div>
        )}
        <button className="bg-slate-900 px-3 py-1 text-white disabled:opacity-50" type="submit" disabled={!canCreate || createMutation.isPending}>Auftrag erstellen</button>
      </form>
    </section>
  )
}
