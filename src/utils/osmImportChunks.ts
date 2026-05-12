import type { GeoJsonFeatureCollection, GeoJsonInput, GeoJsonShape } from '../types/models'
import { getGeometryFromAreaGeoJson } from './campaignAreaMap'

const EARTH_RADIUS_METERS = 6378137
const MAX_MERCATOR_LAT = 85.05112878
export const DEFAULT_OSM_IMPORT_CHUNK_SIZE_METERS = 500

type Point = [number, number]
type Ring = Point[]
type Polygon = Ring[]
type ProjectedBounds = { minX: number; minY: number; maxX: number; maxY: number }

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

const ringsFromGeometry = (geometry?: GeoJsonShape | GeoJsonFeatureCollection | null): Polygon[] => {
  if (!geometry) return []
  if (geometry.type === 'FeatureCollection') return geometry.features.flatMap((feature) => ringsFromGeometry(feature.geometry))
  if (geometry.type === 'Polygon') return [geometry.coordinates as Polygon]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as Polygon[]
  return []
}

const getProjectedBounds = (polygons: Polygon[]): ProjectedBounds | null => {
  const points = polygons.flat(2).map(projectPoint)
  if (points.length === 0) return null
  return points.reduce<ProjectedBounds>((bounds, [x, y]) => ({
    minX: Math.min(bounds.minX, x),
    minY: Math.min(bounds.minY, y),
    maxX: Math.max(bounds.maxX, x),
    maxY: Math.max(bounds.maxY, y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
}

const pointInRing = ([x, y]: Point, ring: Ring) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

const pointInPolygon = (point: Point, polygon: Polygon) => {
  const [outer, ...holes] = polygon
  if (!outer || !pointInRing(point, outer)) return false
  return !holes.some((hole) => pointInRing(point, hole))
}

const orientation = (a: Point, b: Point, c: Point) => {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])
  if (Math.abs(value) < 1e-9) return 0
  return value > 0 ? 1 : 2
}

const pointOnSegment = (point: Point, a: Point, b: Point) =>
  point[0] <= Math.max(a[0], b[0]) + 1e-9
  && point[0] + 1e-9 >= Math.min(a[0], b[0])
  && point[1] <= Math.max(a[1], b[1]) + 1e-9
  && point[1] + 1e-9 >= Math.min(a[1], b[1])

const segmentsIntersect = (a1: Point, a2: Point, b1: Point, b2: Point) => {
  const o1 = orientation(a1, a2, b1)
  const o2 = orientation(a1, a2, b2)
  const o3 = orientation(b1, b2, a1)
  const o4 = orientation(b1, b2, a2)

  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && pointOnSegment(b1, a1, a2)) return true
  if (o2 === 0 && pointOnSegment(b2, a1, a2)) return true
  if (o3 === 0 && pointOnSegment(a1, b1, b2)) return true
  if (o4 === 0 && pointOnSegment(a2, b1, b2)) return true
  return false
}

const ringIntersectsRing = (a: Ring, b: Ring) => {
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) return true
    }
  }
  return false
}

const polygonsIntersect = (a: Polygon, b: Polygon) => {
  const outerA = a[0]
  const outerB = b[0]
  if (!outerA || !outerB) return false
  if (outerA.some((point) => pointInPolygon(point, b))) return true
  if (outerB.some((point) => pointInPolygon(point, a))) return true
  return a.some((ringA) => b.some((ringB) => ringIntersectsRing(ringA, ringB)))
}

const rectanglePolygon = (minX: number, minY: number, maxX: number, maxY: number): Polygon => [[
  [minX, minY],
  [maxX, minY],
  [maxX, maxY],
  [minX, maxY],
  [minX, minY],
]]

const rectangleFeature = (chunk: number, minX: number, minY: number, maxX: number, maxY: number): OsmImportChunkFeature => ({
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [rectanglePolygon(minX, minY, maxX, maxY)[0].map(unprojectPoint)],
  },
  properties: { chunk, cursor: chunk + 1 },
})

export const buildOsmImportChunks = (
  geojson: GeoJsonInput | null | undefined,
  chunkSizeMeters = DEFAULT_OSM_IMPORT_CHUNK_SIZE_METERS,
): OsmImportChunkFeatureCollection => {
  const geometry = getGeometryFromAreaGeoJson(geojson)
  const sourcePolygons = ringsFromGeometry(geometry)
  const polygons = sourcePolygons.map((polygon) => polygon.map((ring) => ring.map(projectPoint)))
  const bounds = getProjectedBounds(sourcePolygons)
  if (!bounds || chunkSizeMeters <= 0) return { type: 'FeatureCollection', features: [] }

  const features: OsmImportChunkFeature[] = []
  const minX = Math.floor(bounds.minX / chunkSizeMeters) * chunkSizeMeters
  const minY = Math.floor(bounds.minY / chunkSizeMeters) * chunkSizeMeters
  const maxX = Math.ceil(bounds.maxX / chunkSizeMeters) * chunkSizeMeters
  const maxY = Math.ceil(bounds.maxY / chunkSizeMeters) * chunkSizeMeters
  const cols = Math.max(1, Math.ceil((maxX - minX) / chunkSizeMeters))
  const rows = Math.max(1, Math.ceil((maxY - minY) / chunkSizeMeters))
  let chunk = 0

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cellMinX = minX + col * chunkSizeMeters
      const cellMinY = minY + row * chunkSizeMeters
      const cellMaxX = cellMinX + chunkSizeMeters
      const cellMaxY = cellMinY + chunkSizeMeters
      const rectangle = rectanglePolygon(cellMinX, cellMinY, cellMaxX, cellMaxY)
      if (polygons.some((polygon) => polygonsIntersect(rectangle, polygon))) {
        features.push(rectangleFeature(chunk, cellMinX, cellMinY, cellMaxX, cellMaxY))
        chunk += 1
      }
    }
  }

  return { type: 'FeatureCollection', features }
}
