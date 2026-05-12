import { useMemo } from 'react'
import { GeoJSON, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import type { Area, Assignment } from '../types/models'
import { getAreaMaskGeometry, getAreaPositions, MAP_PANES, MapLayerPanes, MapMask, MapViewportController } from './MapViewport'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'
import { getGeometryFromAreaGeoJson } from '../utils/campaignAreaMap'
import { campaignBoothLocationIcon, posterLocationIcon } from '../utils/mapIcons'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]

export function MapPanel({ assignments, areas }: { assignments: Assignment[]; areas: Area[] }) {
  const posterLocations = assignments.flatMap((assignment) => assignment.posterLocations?.map((posterLocation) => ({ ...posterLocation, assignmentTitle: assignment.title })) ?? [])
  const campaignBoothLocations = assignments.flatMap((assignment) => {
    const boothLocation = assignment.campaignBoothLocation ?? assignment.campaign_booth_location
    return boothLocation ? [{ ...boothLocation, assignmentTitle: assignment.title }] : []
  })
  const center: [number, number] = posterLocations[0] ? [posterLocations[0].lat, posterLocations[0].lng] : campaignBoothLocations[0] ? [campaignBoothLocations[0].lat, campaignBoothLocations[0].lng] : DEFAULT_CENTER
  const areaPositions = useMemo(() => areas.flatMap(getAreaPositions), [areas])
  const posterPositions = useMemo(() => posterLocations.map((posterLocation): [number, number] => [posterLocation.lat, posterLocation.lng]), [posterLocations])
  const campaignBoothPositions = useMemo(() => campaignBoothLocations.map((boothLocation): [number, number] => [boothLocation.lat, boothLocation.lng]), [campaignBoothLocations])
  const fitPositions = areaPositions.length > 0 ? areaPositions : posterPositions.length > 0 ? posterPositions : campaignBoothPositions
  const maskGeometry = useMemo(() => getAreaMaskGeometry(areas), [areas])

  return (
    <div className="aspect-square w-full overflow-hidden rounded border border-slate-200">
      <MapContainer center={center} zoom={6} maxBoundsViscosity={0.85} className="h-full w-full">
        <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
        <MapLayerPanes />
        <MapMask geometry={maskGeometry} />
        {posterLocations.map((posterLocation) => (
          <Marker key={posterLocation.id} pane={MAP_PANES.markers} position={[posterLocation.lat, posterLocation.lng]} icon={posterLocationIcon}>
            <Popup>
              <strong>{posterLocation.label ?? posterLocation.assignmentTitle}</strong>
              <br />
              Koordinaten: {posterLocation.lat}, {posterLocation.lng}
            </Popup>
          </Marker>
        ))}
        {campaignBoothLocations.map((boothLocation) => (
          <Marker key={`campaign-booth-${boothLocation.id}`} pane={MAP_PANES.markers} position={[boothLocation.lat, boothLocation.lng]} icon={campaignBoothLocationIcon}>
            <Popup>
              <strong>{boothLocation.label ?? boothLocation.assignmentTitle}</strong>
              <br />
              Koordinaten: {boothLocation.lat}, {boothLocation.lng}
            </Popup>
          </Marker>
        ))}
        {areas.map((area) => ({ id: area.id, geometry: getGeometryFromAreaGeoJson(area.geojson) })).filter((entry) => entry.geometry).map((entry) => <GeoJSON key={entry.id} pane={MAP_PANES.areas} data={entry.geometry as GeoJSON.GeoJsonObject} />)}
        {fitPositions.length > 0 && <MapViewportController fitPositions={fitPositions} constrainPositions={fitPositions} />}
      </MapContainer>
    </div>
  )
}
