import type { Area, GeoJsonShape } from '../types/models'

export type CampaignAreaUsage = 'boundary' | 'target' | 'unknown'

export type SplitCampaignAreas = {
  boundaries: Area[]
  targets: Area[]
  unknown: Area[]
}

const isFiniteCoordinatePair = (pair: unknown): pair is [number, number] =>
  Array.isArray(pair) && pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1])

export const isValidPolygonOrMultiPolygon = (geojson?: GeoJsonShape | null): boolean => {
  if (!geojson) return false
  if (geojson.type !== 'Polygon' && geojson.type !== 'MultiPolygon') return false
  const coordinates = geojson.type === 'Polygon' ? geojson.coordinates.flat() : geojson.coordinates.flat(2)
  return coordinates.some((pair) => isFiniteCoordinatePair(pair))
}

export const getAreaGeometryBoundsSafely = (geojson?: GeoJsonShape | null): [number, number][] | null => {
  if (!geojson || !isValidPolygonOrMultiPolygon(geojson)) return null

  const coordinates = geojson.type === 'Polygon' ? geojson.coordinates.flat() : geojson.coordinates.flat(2)
  const points: [number, number][] = []

  coordinates.forEach((pair) => {
    if (!isFiniteCoordinatePair(pair)) return
    const [lng, lat] = pair
    points.push([lat, lng])
  })

  return points.length > 2 ? points : null
}

export const splitCampaignAreasByUsage = (areas: Area[]): SplitCampaignAreas => {
  const result: SplitCampaignAreas = { boundaries: [], targets: [], unknown: [] }
  areas.forEach((area) => {
    if (area.pivot?.usage === 'boundary') result.boundaries.push(area)
    else if (area.pivot?.usage === 'target') result.targets.push(area)
    else result.unknown.push(area)
  })
  return result
}

export const getAreaUsageLabel = (usage: CampaignAreaUsage) => {
  if (usage === 'boundary') return 'Begrenzung'
  if (usage === 'target') return 'Zielgebiet'
  return 'Unbekannt'
}
