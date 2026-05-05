import type { GeoJsonFeature, GeoJsonFeatureCollection, GeoJsonGeometry, GeoJsonInput, GeoJsonShape } from '../types/models'

const POLYGON_ERROR = 'Keine darstellbare GeoJSON-Geometrie vorhanden (Polygon/MultiPolygon erwartet).'

export type ImportedAreaItem = {
  id: string
  geometry: GeoJsonGeometry
  feature: GeoJsonFeature
  properties: Record<string, unknown>
  renderWarning?: string
}

export type GeoJsonImportResult = {
  items: ImportedAreaItem[]
  skipped: number
  parseError?: string
}

const isGeoJsonGeometry = (value: unknown): value is GeoJsonGeometry => {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return (type === 'Polygon' || type === 'MultiPolygon') && Array.isArray((value as { coordinates?: unknown }).coordinates)
}

const parseGeometryString = (value: string): GeoJsonGeometry | null => {
  try {
    const parsed = JSON.parse(value) as unknown
    return isGeoJsonGeometry(parsed) ? parsed : null
  } catch {
    return null
  }
}

const getFeatureGeometry = (feature: GeoJsonFeature): GeoJsonGeometry | null => {
  const rawGeometry = feature.geometry as unknown
  if (typeof rawGeometry === 'string') return parseGeometryString(rawGeometry)
  if (!isGeoJsonGeometry(rawGeometry)) return null
  return rawGeometry
}

const isValidFeatureCollection = (value: unknown): value is GeoJsonFeatureCollection =>
  Boolean(value && typeof value === 'object' && (value as { type?: unknown }).type === 'FeatureCollection' && Array.isArray((value as { features?: unknown }).features))

const isValidFeature = (value: unknown): value is GeoJsonFeature =>
  Boolean(value && typeof value === 'object' && (value as { type?: unknown }).type === 'Feature')

export const parseGeoJsonImport = (raw: string): GeoJsonImportResult => {
  try {
    const parsed = JSON.parse(raw) as unknown

    if (isGeoJsonGeometry(parsed)) {
      return { items: [{ id: '1', geometry: parsed, feature: { type: 'Feature', geometry: parsed, properties: {} }, properties: {} }], skipped: 0 }
    }

    if (isValidFeature(parsed)) {
      const geometry = getFeatureGeometry(parsed)
      if (!geometry) return { items: [], skipped: 1, parseError: POLYGON_ERROR }
      return { items: [{ id: '1', geometry, feature: { ...parsed, geometry }, properties: (parsed.properties && typeof parsed.properties === 'object' ? parsed.properties : {}) as Record<string, unknown> }], skipped: 0 }
    }

    if (isValidFeatureCollection(parsed)) {
      const items = parsed.features.flatMap((feature, index) => {
        if (!isValidFeature(feature)) return []
        const geometry = getFeatureGeometry(feature)
        if (!geometry) return []
        return [{ id: String(index + 1), geometry, feature: { ...feature, geometry }, properties: (feature.properties && typeof feature.properties === 'object' ? feature.properties : {}) as Record<string, unknown> }]
      })
      return { items, skipped: parsed.features.length - items.length, parseError: items.length === 0 ? POLYGON_ERROR : undefined }
    }

    return { items: [], skipped: 0, parseError: POLYGON_ERROR }
  } catch {
    return { items: [], skipped: 0, parseError: 'GeoJSON ist kein valides JSON.' }
  }
}

export const normalizeGeoJsonInput = (value: string): { parsed?: GeoJsonInput; preview?: GeoJsonShape | GeoJsonFeature | GeoJsonFeatureCollection; error?: string } => {
  const result = parseGeoJsonImport(value)
  if (result.parseError || result.items.length === 0) return { error: result.parseError ?? POLYGON_ERROR }
  try {
    const parsed = JSON.parse(value) as GeoJsonInput
    if (parsed.type === 'FeatureCollection') return { parsed, preview: { type: 'FeatureCollection', features: result.items.map((item) => item.feature) } }
    if (parsed.type === 'Feature') return { parsed, preview: result.items[0].geometry }
    return { parsed, preview: result.items[0].geometry }
  } catch {
    return { error: 'GeoJSON ist kein valides JSON.' }
  }
}

export const getSuggestedAreaName = (_input: unknown): string => ''
