import { useMemo } from 'react'
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet'
import { Link } from 'react-router-dom'
import type { PathOptions } from 'leaflet'
import type { Area, Assignment, GeoJsonFeatureCollection } from '../types/models'
import { getAreaMaskGeometry, getAreaPositions, MAP_PANES, MapLayerPanes, MapMask, MapViewportController } from './MapViewport'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'
import { getAreaGeometryBoundsSafely, getAreaUsageLabel, isValidPolygonOrMultiPolygon, sanitizeFeatureCollection, splitCampaignAreasByUsage } from '../utils/campaignAreaMap'
import { assignmentStatusLabel, assignmentTypeLabel } from '../utils/assignment'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]

const areaMapStyles: Record<'boundary' | 'target' | 'unknown', PathOptions> = {
  boundary: { color: '#1d4ed8', weight: 5, fillOpacity: 0, opacity: 0.95 },
  target: { color: '#0f766e', weight: 2, fillColor: '#14b8a6', fillOpacity: 0.2, opacity: 0.9 },
  unknown: { color: '#475569', weight: 2, fillColor: '#94a3b8', fillOpacity: 0.08, opacity: 0.8 },
}

const targetAreaIdFromAssignment = (assignment: Assignment): number | null => {
  const rawValue = assignment.targetAreaId ?? assignment.target_area_id ?? assignment.target_area?.id ?? (assignment as { area_id?: number | null }).area_id
  const value = rawValue == null ? null : Number(rawValue)
  return value != null && Number.isFinite(value) ? value : null
}

const areaCenter = (area: Area): [number, number] | null => {
  const positions = getAreaPositions(area)
  if (positions.length === 0) return null

  const totals = positions.reduce((sum, [lat, lng]) => ({ lat: sum.lat + lat, lng: sum.lng + lng }), { lat: 0, lng: 0 })
  return [totals.lat / positions.length, totals.lng / positions.length]
}

export function CampaignAreaMap({ areas, assignments = [], mapGeoJson, isLoading, errorMessage }: { areas: Area[]; assignments?: Assignment[]; mapGeoJson?: GeoJsonFeatureCollection | null; isLoading?: boolean; errorMessage?: string | null }) {
  const { boundaries, targets, unknown } = useMemo(() => splitCampaignAreasByUsage(areas), [areas])
  const boundariesById = useMemo(() => new Map(boundaries.map((boundary) => [boundary.id, boundary.name])), [boundaries])
  const assignmentsByTargetAreaId = useMemo(() => {
    const groups = new Map<number, Assignment[]>()
    assignments.forEach((assignment) => {
      const targetAreaId = targetAreaIdFromAssignment(assignment)
      if (targetAreaId == null) return
      if (!groups.has(targetAreaId)) groups.set(targetAreaId, [])
      groups.get(targetAreaId)?.push(assignment)
    })
    return groups
  }, [assignments])

  const mapFeatures = useMemo(() => {
    const allAreas: Array<{ area: Area; usage: 'boundary' | 'target' | 'unknown' }> = [
      ...boundaries.map((area) => ({ area, usage: 'boundary' as const })),
      ...targets.map((area) => ({ area, usage: 'target' as const })),
      ...unknown.map((area) => ({ area, usage: 'unknown' as const })),
    ]

    return allAreas.map((entry) => ({
      ...entry,
      validGeometry: isValidPolygonOrMultiPolygon(entry.area.geojson),
      bounds: getAreaGeometryBoundsSafely(entry.area.geojson),
    }))
  }, [boundaries, targets, unknown])

  const allBounds = useMemo(() => mapFeatures.flatMap((feature) => feature.bounds ?? []), [mapFeatures])
  const boundaryBounds = useMemo(() => boundaries.flatMap(getAreaPositions), [boundaries])
  const invalidGeometryCount = useMemo(() => mapFeatures.filter((feature) => !feature.validGeometry).length, [mapFeatures])
  const hasAnyGeometry = allBounds.length > 0
  const maskGeometry = useMemo(() => getAreaMaskGeometry(boundaries), [boundaries])
  const sanitizedMapGeoJson = useMemo(() => (mapGeoJson?.type === 'FeatureCollection' ? sanitizeFeatureCollection(mapGeoJson) : null), [mapGeoJson])

  const targetAssignmentMarkers = useMemo(() => targets.map((target) => ({
    area: target,
    center: areaCenter(target),
    assignments: assignmentsByTargetAreaId.get(target.id) ?? [],
  })).filter((entry): entry is { area: Area; center: [number, number]; assignments: Assignment[] } => entry.center != null), [targets, assignmentsByTargetAreaId])

  if (isLoading) {
    return <div className="rounded border bg-white p-4 space-y-2"><h2 className="font-medium">Karte</h2><p className="text-sm text-slate-600">Kartenflächen werden geladen...</p></div>
  }

  if (errorMessage) {
    return <div className="rounded border bg-white p-4 space-y-2"><h2 className="font-medium">Karte</h2><p className="text-sm text-red-700">{errorMessage}</p></div>
  }

  return <div className="rounded border bg-white p-4 space-y-3"><h2 className="font-medium">Karte</h2>
    <p className="text-xs text-slate-600">Begrenzung = starke Außenlinie, keine Füllung · Zielgebiet = transparente Füllung</p>
    {unknown.length > 0 && <p className="text-sm text-amber-700">Einige Flächen haben keine Nutzungsart.</p>}
    {invalidGeometryCount > 0 && <p className="text-sm text-amber-700">Eine oder mehrere Flächen haben keine gültige Geometrie. (Ungültige Geometrie: {invalidGeometryCount})</p>}

    <div className="aspect-square w-full overflow-hidden rounded border">
      <MapContainer center={DEFAULT_CENTER} zoom={6} maxBoundsViscosity={0.85} className="h-full w-full">
        <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
        <MapLayerPanes />
        <MapMask geometry={maskGeometry} />
        {sanitizedMapGeoJson && sanitizedMapGeoJson.features.length > 0
          ? <GeoJSON pane={MAP_PANES.areas} data={sanitizedMapGeoJson as GeoJSON.GeoJsonObject} style={(layerFeature) => {
            const props = (layerFeature?.properties ?? {}) as Record<string, unknown>
            const usage = props.usage === 'boundary' || props.usage === 'target' ? props.usage : 'unknown'
            return areaMapStyles[usage]
          }} />
          : mapFeatures.filter((feature) => feature.validGeometry).map((feature) => <GeoJSON key={`${feature.usage}-${feature.area.id}`} pane={feature.usage === 'boundary' ? MAP_PANES.boundary : feature.usage === 'target' ? MAP_PANES.target : MAP_PANES.areas} data={feature.area.geojson as GeoJSON.GeoJsonObject} style={areaMapStyles[feature.usage]}><Popup><div className="space-y-1 text-sm"><p className="font-medium">{feature.area.name}</p><p>{getAreaUsageLabel(feature.usage)}</p>{feature.usage === 'target' && <p>Zugeordnete Begrenzung: {feature.area.pivot?.boundary_area_id ? (boundariesById.get(feature.area.pivot.boundary_area_id) ?? `ID ${feature.area.pivot.boundary_area_id}`) : 'Keine'}</p>}{feature.usage === 'target' && feature.area.pivot?.notes && <p>Notizen: {feature.area.pivot.notes}</p>}<Link className="text-blue-600" to={`/areas/${feature.area.id}`}>Zur Flächendetailseite</Link></div></Popup></GeoJSON>)}
        {targetAssignmentMarkers.map(({ area, center, assignments: areaAssignments }) => (
          <CircleMarker key={`assignment-count-${area.id}`} pane={MAP_PANES.markers} center={center} radius={16} pathOptions={{ color: '#0f172a', fillColor: areaAssignments.length > 0 ? '#f97316' : '#64748b', fillOpacity: 0.95, weight: 2 }}>
            <Tooltip permanent direction="center" className="!border-0 !bg-transparent !p-0 !font-semibold !text-white !shadow-none" opacity={1}>{areaAssignments.length}</Tooltip>
            <Popup>
              <div className="min-w-48 space-y-2 text-sm">
                <div>
                  <p className="font-medium">{area.name}</p>
                  <p className="text-slate-600">{areaAssignments.length} Aufträge</p>
                </div>
                {areaAssignments.length === 0
                  ? <p className="text-slate-600">Keine Aufträge für dieses Zielgebiet.</p>
                  : <div className="space-y-1">
                    {areaAssignments.map((assignment) => (
                      <div key={assignment.id} className="border-t pt-1">
                        <Link className="font-medium text-blue-600" to={`/assignments/${assignment.id}`}>{assignment.title}</Link>
                        <p className="text-xs text-slate-600">{assignmentTypeLabel[assignment.type]} · {assignmentStatusLabel[assignment.status]}</p>
                      </div>
                    ))}
                  </div>}
                <Link className="text-blue-600" to={`/areas/${area.id}`}>Zur Flächendetailseite</Link>
              </div>
            </Popup>
          </CircleMarker>
        ))}
        {hasAnyGeometry && <MapViewportController fitPositions={allBounds} constrainPositions={boundaryBounds.length > 0 ? boundaryBounds : allBounds} maxZoom={15} />}
      </MapContainer>
      {!hasAnyGeometry && <div className="p-3 text-sm text-slate-600">Keine Kartenflächen für diese Kampagne vorhanden.</div>}
    </div>
  </div>
}
