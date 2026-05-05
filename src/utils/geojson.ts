import type { GeoJsonFeature, GeoJsonFeatureCollection, GeoJsonGeometry, GeoJsonInput, GeoJsonShape } from '../types/models'

const POLYGON_ERROR = 'Nur Polygon- oder MultiPolygon-Geometrien werden unterstützt.'

const isGeoJsonGeometry = (value: unknown): value is GeoJsonGeometry => {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return type === 'Polygon' || type === 'MultiPolygon'
}

const geometryFromFeature = (feature: GeoJsonFeature): GeoJsonGeometry | null => {
  const geometry = feature.geometry
  return geometry && isGeoJsonGeometry(geometry) ? geometry : null
}

const isValidFeatureCollection = (value: unknown): value is GeoJsonFeatureCollection => {
  if (!value || typeof value !== 'object') return false
  if ((value as { type?: unknown }).type !== 'FeatureCollection') return false
  return Array.isArray((value as { features?: unknown }).features)
}

const isValidFeature = (value: unknown): value is GeoJsonFeature => {
  if (!value || typeof value !== 'object') return false
  return (value as { type?: unknown }).type === 'Feature'
}

export const getSuggestedAreaName = (input: GeoJsonInput): string => {
  const properties = input.type === 'FeatureCollection' ? input.features[0]?.properties : input.type === 'Feature' ? input.properties : null
  if (!properties || typeof properties !== 'object') return ''
  const gen = (properties as Record<string, unknown>).GEN
  const name = (properties as Record<string, unknown>).name
  if (typeof gen === 'string' && gen.trim()) return gen.trim()
  if (typeof name === 'string' && name.trim()) return name.trim()
  return ''
}

export const normalizeGeoJsonInput = (value: string): { parsed?: GeoJsonInput; preview?: GeoJsonShape | GeoJsonFeature | GeoJsonFeatureCollection; error?: string } => {
  try {
    const parsed = JSON.parse(value) as unknown
    if (isGeoJsonGeometry(parsed)) return { parsed, preview: parsed }

    if (isValidFeature(parsed)) {
      const geometry = geometryFromFeature(parsed)
      if (!geometry) return { error: POLYGON_ERROR }
      return { parsed, preview: geometry }
    }

    if (isValidFeatureCollection(parsed)) {
      if (parsed.features.length === 0) return { error: 'Ungültige Geometrie: FeatureCollection enthält keine Features.' }
      const hasInvalid = parsed.features.some((feature) => !isValidFeature(feature) || !geometryFromFeature(feature))
      if (hasInvalid) return { error: POLYGON_ERROR }
      return { parsed, preview: parsed }
    }

    return { error: POLYGON_ERROR }
  } catch {
    return { error: 'GeoJSON ist kein valides JSON.' }
  }
}
