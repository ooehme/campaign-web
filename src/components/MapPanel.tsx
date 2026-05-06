import { GeoJSON, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import type { Area, Assignment } from '../types/models'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'
import { getGeometryFromAreaGeoJson } from '../utils/campaignAreaMap'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]

export function MapPanel({ assignments, areas }: { assignments: Assignment[]; areas: Area[] }) {
  const posterLocations = assignments.flatMap((assignment) => assignment.posterLocations?.map((posterLocation) => ({ ...posterLocation, assignmentTitle: assignment.title })) ?? [])
  const center: [number, number] = posterLocations[0] ? [posterLocations[0].lat, posterLocations[0].lng] : DEFAULT_CENTER

  return (
    <div className="h-96 overflow-hidden rounded border border-slate-200">
      <MapContainer center={center} zoom={6} className="h-full w-full">
        <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
        {posterLocations.map((posterLocation) => (
          <Marker key={posterLocation.id} position={[posterLocation.lat, posterLocation.lng]}>
            <Popup>
              <strong>{posterLocation.label ?? posterLocation.assignmentTitle}</strong>
              <br />
              Koordinaten: {posterLocation.lat}, {posterLocation.lng}
            </Popup>
          </Marker>
        ))}
        {areas.map((area) => ({ id: area.id, geometry: getGeometryFromAreaGeoJson(area.geojson) })).filter((entry) => entry.geometry).map((entry) => <GeoJSON key={entry.id} data={entry.geometry as GeoJSON.GeoJsonObject} />)}
      </MapContainer>
    </div>
  )
}
