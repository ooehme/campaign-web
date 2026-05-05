import type { GeoJsonFeature, GeoJsonFeatureCollection, GeoJsonGeometry, GeoJsonInput } from '../types/models'

export type GeometryStats =
  | { valid: true; type: 'Polygon'; rings: number; firstOuterPoints: number }
  | { valid: true; type: 'MultiPolygon'; polygons: number; rings: number; firstOuterPoints: number }
  | { valid: false; type: 'unbekannt' }

const isFiniteCoordinatePair = (pair: unknown): pair is [number, number] =>
  Array.isArray(pair) && pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1])

export const isGeoJsonGeometry = (value: unknown): value is GeoJsonGeometry => {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return (type === 'Polygon' || type === 'MultiPolygon') && Array.isArray((value as { coordinates?: unknown }).coordinates)
}

export const extractGeometry = (geojson?: unknown): GeoJsonGeometry | null => {
  if (!geojson) return null
  if (isGeoJsonGeometry(geojson)) return geojson
  if (typeof geojson === 'object' && (geojson as { type?: unknown }).type === 'Feature') {
    const geometry = (geojson as GeoJsonFeature).geometry
    return isGeoJsonGeometry(geometry) ? geometry : null
  }
  return null
}

export const extractAllGeometries = (geojson?: unknown): GeoJsonGeometry[] => {
  if (!geojson) return []
  if (typeof geojson === 'string') {
    try { return extractAllGeometries(JSON.parse(geojson) as unknown) } catch { return [] }
  }
  if (isGeoJsonGeometry(geojson)) return [geojson]
  if (typeof geojson === 'object' && (geojson as { type?: unknown }).type === 'Feature') {
    const geometry = (geojson as GeoJsonFeature).geometry
    return isGeoJsonGeometry(geometry) ? [geometry] : []
  }
  if (typeof geojson === 'object' && (geojson as { type?: unknown }).type === 'FeatureCollection') {
    return ((geojson as GeoJsonFeatureCollection).features ?? []).flatMap((feature) => extractAllGeometries(feature))
  }
  return []
}

export const getGeometryStats = (geojson?: unknown): GeometryStats => {
  const geometry = extractGeometry(geojson)
  if (!geometry) return { valid: false, type: 'unbekannt' }
  if (geometry.type === 'Polygon') {
    return { valid: true, type: 'Polygon', rings: geometry.coordinates.length, firstOuterPoints: geometry.coordinates[0]?.length ?? 0 }
  }
  return {
    valid: true,
    type: 'MultiPolygon',
    polygons: geometry.coordinates.length,
    rings: geometry.coordinates.reduce((acc, polygon) => acc + polygon.length, 0),
    firstOuterPoints: geometry.coordinates[0]?.[0]?.length ?? 0,
  }
}

export const getBoundsPoints = (geojson?: unknown): [number, number][] => {
  const points: [number, number][] = []
  extractAllGeometries(geojson).forEach((geometry) => {
    if (geometry.type === 'Polygon') {
      geometry.coordinates.flat().forEach((pair) => {
        if (isFiniteCoordinatePair(pair)) points.push([pair[1], pair[0]])
      })
      return
    }
    geometry.coordinates.flat(2).forEach((pair) => {
      if (isFiniteCoordinatePair(pair)) points.push([pair[1], pair[0]])
    })
  })
  return points
}

export const normalizeGeometryPayload = (parsed: GeoJsonInput): GeoJsonInput => {
  if (parsed.type === 'Feature') return parsed
  if (parsed.type === 'FeatureCollection') return parsed
  return parsed
}
