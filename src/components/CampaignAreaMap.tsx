import { useMemo } from 'react'
import { GeoJSON, MapContainer, Popup, TileLayer } from 'react-leaflet'
import { Link } from 'react-router-dom'
import type { PathOptions } from 'leaflet'
import type { Area, GeoJsonFeatureCollection } from '../types/models'
import { getAreaMaskGeometry, getAreaPositions, MAP_PANES, MapLayerPanes, MapMask, MapViewportController } from './MapViewport'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'
import { getAreaGeometryBoundsSafely, getAreaUsageLabel, isValidPolygonOrMultiPolygon, sanitizeFeatureCollection, splitCampaignAreasByUsage } from '../utils/campaignAreaMap'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]

const areaMapStyles: Record<'boundary' | 'target' | 'unknown', PathOptions> = {
  boundary: { color: '#1d4ed8', weight: 5, fillOpacity: 0, opacity: 0.95 },
  target: { color: '#0f766e', weight: 2, fillColor: '#14b8a6', fillOpacity: 0.2, opacity: 0.9 },
  unknown: { color: '#475569', weight: 2, fillColor: '#94a3b8', fillOpacity: 0.08, opacity: 0.8 },
}

export function CampaignAreaMap({ areas, mapGeoJson, isLoading, errorMessage }: { areas: Area[]; mapGeoJson?: GeoJsonFeatureCollection | null; isLoading?: boolean; errorMessage?: string | null }) {
  const { boundaries, targets, unknown } = useMemo(() => splitCampaignAreasByUsage(areas), [areas])
  const boundariesById = useMemo(() => new Map(boundaries.map((boundary) => [boundary.id, boundary.name])), [boundaries])

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

  const groupedTargets = useMemo(() => {
    const groups = new Map<number, Area[]>()
    const unassigned: Area[] = []
    targets.forEach((target) => {
      const boundaryId = target.pivot?.boundary_area_id
      if (!boundaryId || !boundariesById.has(boundaryId)) {
        unassigned.push(target)
        return
      }
      if (!groups.has(boundaryId)) groups.set(boundaryId, [])
      groups.get(boundaryId)?.push(target)
    })
    return { groups, unassigned }
  }, [targets, boundariesById])

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
        {hasAnyGeometry && <MapViewportController fitPositions={allBounds} constrainPositions={boundaryBounds.length > 0 ? boundaryBounds : allBounds} maxZoom={15} />}
      </MapContainer>
      {!hasAnyGeometry && <div className="p-3 text-sm text-slate-600">Keine Kartenflächen für diese Kampagne vorhanden.</div>}
    </div>

    <div className="grid gap-3 md:grid-cols-2 text-sm">
      <div>
        <h3 className="font-medium">Begrenzungen</h3>
        {boundaries.map((boundary) => <div key={boundary.id} className="mt-2 rounded border p-2"><p className="font-medium">{boundary.name}</p>{(groupedTargets.groups.get(boundary.id) ?? []).map((target) => <p key={target.id}>- Zielgebiet: {target.name}</p>)}</div>)}
      </div>
      <div>
        <h3 className="font-medium">Zielgebiete ohne zugeordnete Begrenzung</h3>
        {groupedTargets.unassigned.length === 0 ? <p className="text-slate-500">Keine</p> : groupedTargets.unassigned.map((target) => <p key={target.id}>- {target.name}</p>)}
      </div>
    </div>
  </div>
}
