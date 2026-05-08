import { useEffect, useMemo } from 'react'
import { latLngBounds } from 'leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import { GeoJSON, Pane, useMap } from 'react-leaflet'
import type { Area, GeoJsonFeatureCollection, GeoJsonInput, GeoJsonShape } from '../types/models'
import { getGeometryFromAreaGeoJson } from '../utils/campaignAreaMap'

export const MAP_PANES = {
  mask: 'map-mask',
  boundary: 'map-boundary',
  target: 'map-target',
  areas: 'map-areas',
  buildings: 'map-buildings',
  markers: 'map-markers',
} as const

type MapPaneKey = keyof typeof MAP_PANES

const isFinitePosition = (position: unknown): position is [number, number] =>
  Array.isArray(position) && position.length >= 2 && Number.isFinite(position[0]) && Number.isFinite(position[1])

const collectGeometryPositions = (geometry?: GeoJsonShape | GeoJsonFeatureCollection | null): [number, number][] => {
  if (!geometry) return []
  if (geometry.type === 'FeatureCollection') return geometry.features.flatMap((feature) => collectGeometryPositions(feature.geometry))

  const coordinates = geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates.flat(2)
  return coordinates.flatMap((coordinate) => isFinitePosition(coordinate) ? [[coordinate[1], coordinate[0]] as [number, number]] : [])
}

const collectMaskHoles = (geometry?: GeoJsonShape | GeoJsonFeatureCollection | null): number[][][] => {
  if (!geometry) return []
  if (geometry.type === 'FeatureCollection') return geometry.features.flatMap((feature) => collectMaskHoles(feature.geometry))

  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.flatMap((polygon) => {
    const outerRing = polygon[0]
    return outerRing?.length ? [outerRing.map(([lng, lat]) => [lng, lat])] : []
  })
}

export const getAreaPositions = (area: Area | null | undefined) => collectGeometryPositions(getGeometryFromAreaGeoJson(area?.geojson))

export const getGeoJsonPositions = (geojson: GeoJsonInput | GeoJsonFeatureCollection | null | undefined) =>
  collectGeometryPositions(getGeometryFromAreaGeoJson(geojson as GeoJsonInput | null) ?? (geojson?.type === 'FeatureCollection' ? geojson : null))

export const getAreaMaskGeometry = (areas: Array<Area | null | undefined>): GeoJSON.Polygon | null => {
  const holes = areas.flatMap((area) => collectMaskHoles(getGeometryFromAreaGeoJson(area?.geojson)))
  if (holes.length === 0) return null

  const worldRing: number[][] = [[-180, -90], [-180, 90], [180, 90], [180, -90], [-180, -90]]
  return { type: 'Polygon', coordinates: [worldRing, ...holes] }
}

export const getGeoJsonMaskGeometry = (geojson: GeoJsonInput | GeoJsonFeatureCollection | null | undefined): GeoJSON.Polygon | null => {
  const geometry = getGeometryFromAreaGeoJson(geojson as GeoJsonInput | null) ?? (geojson?.type === 'FeatureCollection' ? geojson : null)
  const holes = collectMaskHoles(geometry)
  if (holes.length === 0) return null

  const worldRing: number[][] = [[-180, -90], [-180, 90], [180, 90], [180, -90], [-180, -90]]
  return { type: 'Polygon', coordinates: [worldRing, ...holes] }
}

export function MapLayerPanes({ panes = ['mask', 'boundary', 'target', 'areas', 'buildings', 'markers'] }: { panes?: MapPaneKey[] }) {
  return <>
    {panes.includes('mask') && <Pane name={MAP_PANES.mask} style={{ zIndex: 405, pointerEvents: 'none' }} />}
    {panes.includes('boundary') && <Pane name={MAP_PANES.boundary} style={{ zIndex: 410 }} />}
    {panes.includes('target') && <Pane name={MAP_PANES.target} style={{ zIndex: 420 }} />}
    {panes.includes('areas') && <Pane name={MAP_PANES.areas} style={{ zIndex: 425 }} />}
    {panes.includes('buildings') && <Pane name={MAP_PANES.buildings} style={{ zIndex: 430 }} />}
    {panes.includes('markers') && <Pane name={MAP_PANES.markers} style={{ zIndex: 440 }} />}
  </>
}

export function MapMask({ geometry }: { geometry: GeoJSON.Polygon | null }) {
  return geometry ? <GeoJSON pane={MAP_PANES.mask} data={geometry as GeoJSON.GeoJsonObject} interactive={false} style={{ stroke: false, fillColor: '#0f172a', fillOpacity: 0.18, fillRule: 'evenodd' }} /> : null
}

export function MapViewportController({
  fitPositions,
  constrainPositions,
  maxZoom = 17,
  padding = [24, 24],
}: {
  fitPositions: [number, number][]
  constrainPositions?: [number, number][]
  maxZoom?: number
  padding?: [number, number]
}) {
  const map = useMap()
  const fitBounds = useMemo<LatLngBoundsExpression | null>(() => fitPositions.length > 0 ? fitPositions : null, [fitPositions])
  const maxBounds = useMemo(() => {
    const positions = constrainPositions ?? fitPositions
    return positions.length > 0 ? latLngBounds(positions).pad(0.18) : null
  }, [constrainPositions, fitPositions])

  useEffect(() => {
    if (fitBounds) map.fitBounds(fitBounds, { padding, maxZoom })
  }, [fitBounds, map, maxZoom, padding])

  useEffect(() => {
    if (!maxBounds) return

    const previousMinZoom = map.getMinZoom()
    map.setMaxBounds(maxBounds)
    map.setMinZoom(map.getBoundsZoom(maxBounds, false))

    return () => {
      map.setMinZoom(previousMinZoom)
    }
  }, [map, maxBounds])

  return null
}
