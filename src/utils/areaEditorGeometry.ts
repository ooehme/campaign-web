import type { GeoJsonGeometry, GeoJsonMultiPolygon, GeoJsonPolygon } from '../types/models'

type Position = [number, number]

export type EditableVertex = {
  geometryType: 'Polygon' | 'MultiPolygon'
  polygonIndex: number
  ringIndex: number
  vertexIndex: number
  coordinate: Position
}

export type EditableMidpoint = {
  geometryType: 'Polygon' | 'MultiPolygon'
  polygonIndex: number
  ringIndex: number
  vertexIndex: number
  coordinate: Position
}

const isPosition = (value: unknown): value is Position => Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])

const closeRing = (ring: Position[]): Position[] => {
  if (ring.length === 0) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] === last[0] && first[1] === last[1]) return ring
  return [...ring, [first[0], first[1]]]
}

const normalizeRing = (ring: unknown): Position[] => closeRing((Array.isArray(ring) ? ring : []).filter(isPosition).map(([lng, lat]) => [lng, lat]))

const toPolygons = (geometry: GeoJsonGeometry): Position[][][] => {
  if (geometry.type === 'Polygon') return [geometry.coordinates.map(normalizeRing)]
  return geometry.coordinates.map((polygon) => polygon.map(normalizeRing))
}

const fromPolygons = (type: 'Polygon' | 'MultiPolygon', polygons: Position[][][]): GeoJsonGeometry => {
  if (type === 'Polygon') return { type: 'Polygon', coordinates: polygons[0] ?? [] } as GeoJsonPolygon
  return { type: 'MultiPolygon', coordinates: polygons } as GeoJsonMultiPolygon
}

export const getEditableVertices = (geometry: GeoJsonGeometry): EditableVertex[] => {
  const polygons = toPolygons(geometry)
  return polygons.flatMap((polygon, polygonIndex) => polygon.flatMap((ring, ringIndex) => ring.slice(0, -1).map((coordinate, vertexIndex) => ({ geometryType: geometry.type, polygonIndex, ringIndex, vertexIndex, coordinate }))))
}

export const getEditableMidpoints = (geometry: GeoJsonGeometry): EditableMidpoint[] => {
  const polygons = toPolygons(geometry)
  return polygons.flatMap((polygon, polygonIndex) => polygon.flatMap((ring, ringIndex) => ring.slice(0, -1).map((coordinate, vertexIndex) => {
    const next = ring[vertexIndex + 1]
    return {
      geometryType: geometry.type,
      polygonIndex,
      ringIndex,
      vertexIndex,
      coordinate: [(coordinate[0] + next[0]) / 2, (coordinate[1] + next[1]) / 2],
    }
  })))
}

export const moveVertex = (geometry: GeoJsonGeometry, target: EditableVertex, coordinate: Position): GeoJsonGeometry => {
  const polygons = toPolygons(geometry)
  const ring = polygons[target.polygonIndex]?.[target.ringIndex]
  if (!ring || target.vertexIndex < 0 || target.vertexIndex >= ring.length - 1) return geometry
  ring[target.vertexIndex] = coordinate
  if (target.vertexIndex === 0) ring[ring.length - 1] = [coordinate[0], coordinate[1]]
  return fromPolygons(geometry.type, polygons)
}

export const insertMidpoint = (geometry: GeoJsonGeometry, target: EditableMidpoint, coordinate?: Position): GeoJsonGeometry => {
  const polygons = toPolygons(geometry)
  const ring = polygons[target.polygonIndex]?.[target.ringIndex]
  if (!ring) return geometry
  const nextCoordinate = coordinate ?? target.coordinate
  ring.splice(target.vertexIndex + 1, 0, nextCoordinate)
  return fromPolygons(geometry.type, polygons)
}

export const deleteVertex = (geometry: GeoJsonGeometry, target: EditableVertex): GeoJsonGeometry => {
  const polygons = toPolygons(geometry)
  const ring = polygons[target.polygonIndex]?.[target.ringIndex]
  if (!ring || ring.length <= 4 || target.vertexIndex < 0 || target.vertexIndex >= ring.length - 1) return geometry
  ring.splice(target.vertexIndex, 1)
  ring[ring.length - 1] = [ring[0][0], ring[0][1]]
  return fromPolygons(geometry.type, polygons)
}
