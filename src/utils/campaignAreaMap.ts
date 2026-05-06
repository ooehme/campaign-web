import type { Area, AreaAssignmentRef, GeoJsonFeatureCollection, GeoJsonInput, GeoJsonShape } from '../types/models'

export type CampaignAreaUsage = 'boundary' | 'target' | 'unknown'

export type SplitCampaignAreas = {
  boundaries: Area[]
  targets: Area[]
  unknown: Area[]
}

export type AreaUsageOption = {
  area: Area
  boundaryAreaId?: number | null
}

export const assignmentBoundaryAreaId = (assignment?: { boundary_area_id?: number | null; boundaryAreaId?: number | null } | null) =>
  assignment?.boundary_area_id ?? assignment?.boundaryAreaId ?? null

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

export const getAreaAssignments = (area: Area): AreaAssignmentRef[] => {
  if (area.pivot?.usage) return [{ ...area.pivot }] as AreaAssignmentRef[]
  const assignments = area.assignments ?? area.campaigns ?? []
  if (assignments.length > 0) return assignments
  return []
}

export const getAreaUsageOptions = (areas: Area[], usage: 'boundary' | 'target'): AreaUsageOption[] => {
  const options = new Map<number, AreaUsageOption>()

  areas.forEach((area) => {
    const assignments = getAreaAssignments(area)
    const matchingAssignments = assignments.filter((assignment) => assignment.usage === usage)

    if (matchingAssignments.length === 0 && assignments.length > 0) return

    const boundaryAreaId = usage === 'target'
      ? assignmentBoundaryAreaId(matchingAssignments.find((assignment) => assignmentBoundaryAreaId(assignment) != null)) ?? assignmentBoundaryAreaId(area.pivot) ?? null
      : null

    if (!options.has(area.id)) options.set(area.id, { area, boundaryAreaId })
  })

  return [...options.values()].sort((a, b) => a.area.name.localeCompare(b.area.name, 'de', { sensitivity: 'base' }))
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
