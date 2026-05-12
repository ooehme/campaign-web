import type { GeoJsonFeatureCollection, GeoJsonInput, GeoJsonShape } from '../types/models'
import { getGeometryFromAreaGeoJson } from './campaignAreaMap'

const EARTH_RADIUS_METERS = 6378137
const MAX_MERCATOR_LAT = 85.05112878
export const DEFAULT_OSM_IMPORT_CHUNK_SIZE_METERS = 500

type Point = [number, number]
type Ring = Point[]
type Polygon = Ring[]
type Bounds = { minX: number; minY: number; maxX: number; maxY: number }
type Boundary = 'left' | 'right' | 'bottom' | 'top'
type DraftChunk = { ring: Ring; bounds: Bounds }

export type OsmImportChunkFeature = {
  type: 'Feature'
  geometry: {
    type: 'Polygon'
    coordinates: [Ring]
  }
  properties: {
    chunk: number
    cursor: number
  }
}

export type OsmImportChunkFeatureCollection = {
  type: 'FeatureCollection'
  features: OsmImportChunkFeature[]
}

const clampLatitude = (lat: number) => Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat))

const projectPoint = ([lng, lat]: Point): Point => {
  const clampedLat = clampLatitude(lat)
  return [
    EARTH_RADIUS_METERS * (lng * Math.PI / 180),
    EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI / 180) / 2)),
  ]
}

const unprojectPoint = ([x, y]: Point): Point => [
  (x / EARTH_RADIUS_METERS) * 180 / Math.PI,
  (2 * Math.atan(Math.exp(y / EARTH_RADIUS_METERS)) - Math.PI / 2) * 180 / Math.PI,
]

const samePoint = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9

const closeRing = (ring: Ring): Ring => {
  if (ring.length === 0) return ring
  return samePoint(ring[0], ring[ring.length - 1]) ? ring : [...ring, ring[0]]
}

const openRing = (ring: Ring): Ring => {
  if (ring.length < 2) return ring
  return samePoint(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring
}

const ringsFromGeometry = (geometry?: GeoJsonShape | GeoJsonFeatureCollection | null): Polygon[] => {
  if (!geometry) return []
  if (geometry.type === 'FeatureCollection') return geometry.features.flatMap((feature) => ringsFromGeometry(feature.geometry))
  if (geometry.type === 'Polygon') return [geometry.coordinates as Polygon]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as Polygon[]
  return []
}

const getBounds = (rings: Ring[]): Bounds | null => {
  const points = rings.flat()
  if (points.length === 0) return null
  return points.reduce<Bounds>((bounds, [x, y]) => ({
    minX: Math.min(bounds.minX, x),
    minY: Math.min(bounds.minY, y),
    maxX: Math.max(bounds.maxX, x),
    maxY: Math.max(bounds.maxY, y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
}

const polygonArea = (ring: Ring) => {
  let area = 0
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index]
    const [x2, y2] = ring[index + 1]
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area) / 2
}

const insideBoundary = ([x, y]: Point, bounds: Bounds, boundary: Boundary) => {
  if (boundary === 'left') return x >= bounds.minX - 1e-9
  if (boundary === 'right') return x <= bounds.maxX + 1e-9
  if (boundary === 'bottom') return y >= bounds.minY - 1e-9
  return y <= bounds.maxY + 1e-9
}

const intersectBoundary = ([x1, y1]: Point, [x2, y2]: Point, bounds: Bounds, boundary: Boundary): Point => {
  if (boundary === 'left' || boundary === 'right') {
    const x = boundary === 'left' ? bounds.minX : bounds.maxX
    const ratio = x2 === x1 ? 0 : (x - x1) / (x2 - x1)
    return [x, y1 + (y2 - y1) * ratio]
  }

  const y = boundary === 'bottom' ? bounds.minY : bounds.maxY
  const ratio = y2 === y1 ? 0 : (y - y1) / (y2 - y1)
  return [x1 + (x2 - x1) * ratio, y]
}

const clipBoundary = (ring: Ring, bounds: Bounds, boundary: Boundary): Ring => {
  if (ring.length === 0) return []
  const output: Ring = []

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const previous = ring[(index + ring.length - 1) % ring.length]
    const currentInside = insideBoundary(current, bounds, boundary)
    const previousInside = insideBoundary(previous, bounds, boundary)

    if (currentInside) {
      if (!previousInside) output.push(intersectBoundary(previous, current, bounds, boundary))
      output.push(current)
    } else if (previousInside) {
      output.push(intersectBoundary(previous, current, bounds, boundary))
    }
  }

  return output
}

const clipRingToBounds = (ring: Ring, bounds: Bounds): Ring | null => {
  let clipped = openRing(ring)
  for (const boundary of ['left', 'right', 'bottom', 'top'] as Boundary[]) {
    clipped = clipBoundary(clipped, bounds, boundary)
    if (clipped.length < 3) return null
  }

  const closed = closeRing(clipped)
  return polygonArea(closed) > 1 ? closed : null
}

const featureFromDraft = (draft: DraftChunk, index: number): OsmImportChunkFeature => {
  const chunk = index + 1
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [draft.ring.map(unprojectPoint)],
    },
    properties: { chunk, cursor: chunk },
  }
}

export const buildOsmImportChunks = (
  geojson: GeoJsonInput | null | undefined,
  chunkSizeMeters = DEFAULT_OSM_IMPORT_CHUNK_SIZE_METERS,
): OsmImportChunkFeatureCollection => {
  const geometry = getGeometryFromAreaGeoJson(geojson)
  const outerRings = ringsFromGeometry(geometry)
    .map((polygon) => polygon[0])
    .filter((ring): ring is Ring => Array.isArray(ring) && ring.length >= 4)
    .map((ring) => closeRing(ring.map(projectPoint)))
  const bounds = getBounds(outerRings)
  if (!bounds || chunkSizeMeters <= 0) return { type: 'FeatureCollection', features: [] }

  const minX = Math.floor(bounds.minX / chunkSizeMeters) * chunkSizeMeters
  const minY = Math.floor(bounds.minY / chunkSizeMeters) * chunkSizeMeters
  const maxX = Math.ceil(bounds.maxX / chunkSizeMeters) * chunkSizeMeters
  const maxY = Math.ceil(bounds.maxY / chunkSizeMeters) * chunkSizeMeters
  const cols = Math.max(1, Math.ceil((maxX - minX) / chunkSizeMeters))
  const rows = Math.max(1, Math.ceil((maxY - minY) / chunkSizeMeters))
  const drafts: DraftChunk[] = []

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cellBounds: Bounds = {
        minX: minX + col * chunkSizeMeters,
        minY: minY + row * chunkSizeMeters,
        maxX: minX + (col + 1) * chunkSizeMeters,
        maxY: minY + (row + 1) * chunkSizeMeters,
      }

      outerRings.forEach((ring) => {
        const clipped = clipRingToBounds(ring, cellBounds)
        const clippedBounds = clipped ? getBounds([clipped]) : null
        if (clipped && clippedBounds) drafts.push({ ring: clipped, bounds: clippedBounds })
      })
    }
  }

  const features = drafts
    .sort((a, b) => a.bounds.minY - b.bounds.minY || a.bounds.minX - b.bounds.minX)
    .map(featureFromDraft)

  return { type: 'FeatureCollection', features }
}
