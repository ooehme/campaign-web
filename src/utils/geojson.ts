import type { GeoJsonFeature, GeoJsonFeatureCollection, GeoJsonGeometry, GeoJsonPayload, GeoJsonShape } from '../types/models'

export const INVALID_GEOMETRY_MESSAGE = 'Keine gültige Geometrie vorhanden.'
export const ENCODED_GEOMETRY_MESSAGE = 'Kodierte GeoJSON-Strings werden nicht unterstützt. Bitte senden Sie ein GeoJSON-Objekt.'

const isPosition = (value: unknown): value is [number, number] => Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number'

export const isGeometryObject = (value: unknown): value is GeoJsonGeometry => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const t = (value as { type?: unknown }).type
  const coordinates = (value as { coordinates?: unknown }).coordinates
  if (t === 'Polygon') return Array.isArray(coordinates)
  if (t === 'MultiPolygon') return Array.isArray(coordinates)
  return false
}

export const isGeoJsonFeature = (value: unknown): value is GeoJsonFeature => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value) && (value as { type?: unknown }).type === 'Feature' && isGeometryObject((value as { geometry?: unknown }).geometry))
)

export const isGeoJsonFeatureCollection = (value: unknown): value is GeoJsonFeatureCollection => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value) && (value as { type?: unknown }).type === 'FeatureCollection' && Array.isArray((value as { features?: unknown[] }).features))
)

export const normalizeGeoJsonPayload = (value: unknown): { payload: GeoJsonPayload | null; error?: string } => {
  if (typeof value === 'string') return { payload: null, error: ENCODED_GEOMETRY_MESSAGE }
  if (isGeoJsonFeatureCollection(value)) return { payload: value }
  if (isGeoJsonFeature(value)) return { payload: value }
  if (isGeometryObject(value)) return { payload: value }
  return { payload: null, error: INVALID_GEOMETRY_MESSAGE }
}

export const getGeometryFromPayload = (value: GeoJsonPayload | null | undefined): GeoJsonGeometry | null => {
  if (!value) return null
  if (value.type === 'Feature') return value.geometry
  if (value.type === 'FeatureCollection') {
    const first = value.features.find((feature) => feature?.geometry && isGeometryObject(feature.geometry))
    return first?.geometry ?? null
  }
  return value
}

export const toFeaturePayload = (geometry: GeoJsonShape, properties?: Record<string, unknown>): GeoJsonFeature => ({
  type: 'Feature',
  geometry,
  properties: properties ?? {},
})

export const isValidPolygonGeometry = (geometry: GeoJsonGeometry | null | undefined): geometry is GeoJsonShape => {
  if (!geometry) return false
  const coordinates = geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates.flat(2)
  return coordinates.length > 0 && coordinates.every(isPosition)
}
