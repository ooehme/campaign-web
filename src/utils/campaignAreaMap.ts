import type { Area, GeoJsonFeatureCollection, GeoJsonInput, GeoJsonShape } from '../types/models'

export type CampaignAreaUsage = 'boundary' | 'target' | 'unknown'

export type SplitCampaignAreas = {
  boundaries: Area[]
  targets: Area[]
  unknown: Area[]
}

const isFiniteCoordinatePair = (pair: unknown): pair is [number, number] =>
  Array.isArray(pair) && pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1])

export const getGeometryFromAreaGeoJson = (geojson?: GeoJsonInput | null): GeoJsonShape | GeoJsonFeatureCollection | null => {
  if (!geojson) return null
  if (geojson.type === 'Feature') {
    if (!geojson.geometry || typeof geojson.geometry === 'string') return null
    return geojson.geometry
  }
  if (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon' || geojson.type === 'FeatureCollection') return geojson
  return null
}

export const isValidPolygonOrMultiPolygon = (geojson?: GeoJsonInput | null): boolean => {
  const geometry = getGeometryFromAreaGeoJson(geojson)
  if (!geometry) return false
  if (geometry.type === 'FeatureCollection') return geometry.features.every((feature) => isValidPolygonOrMultiPolygon(feature))
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return false
  const coordinates = geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates.flat(2)
  return coordinates.some((pair) => isFiniteCoordinatePair(pair))
}

export const getAreaGeometryBoundsSafely = (geojson?: GeoJsonInput | null): [number, number][] | null => {
  const geometry = getGeometryFromAreaGeoJson(geojson)
  if (!geometry || !isValidPolygonOrMultiPolygon(geometry)) return null
  if (geometry.type === 'FeatureCollection') {
    const points = geometry.features.flatMap((feature) => getAreaGeometryBoundsSafely(feature) ?? [])
    return points.length > 2 ? points : null
  }

  const coordinates = geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates.flat(2)
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


export const sanitizeFeatureCollection = (collection: GeoJsonFeatureCollection): GeoJsonFeatureCollection => ({
  type: 'FeatureCollection',
  features: collection.features.filter((feature) => isValidPolygonOrMultiPolygon(feature)),
})
