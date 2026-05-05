import { GeoJSON, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import type { Area, Task } from '../types/models'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'
import { normalizeGeoJsonPayload } from '../utils/geojson'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]

export function MapPanel({ tasks, areas }: { tasks: Task[]; areas: Area[] }) {
  const points = tasks.flatMap((task) => task.points?.map((p) => ({ ...p, taskTitle: task.title })) ?? [])
  const center: [number, number] = points[0] ? [points[0].latitude, points[0].longitude] : DEFAULT_CENTER

  return (
    <div className="h-96 overflow-hidden rounded border border-slate-200">
      <MapContainer center={center} zoom={6} className="h-full w-full">
        <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
        {points.map((point) => (
          <Marker key={point.id} position={[point.latitude, point.longitude]}>
            <Popup>
              <strong>{point.label ?? point.taskTitle}</strong>
              <br />
              Koordinaten: {point.latitude}, {point.longitude}
            </Popup>
          </Marker>
        ))}
        {areas.map((area) => ({ area, parsed: normalizeGeoJsonPayload(area.geojson).payload })).filter((entry) => Boolean(entry.parsed)).map((entry) => <GeoJSON key={entry.area.id} data={entry.parsed as GeoJSON.GeoJsonObject} />)}
      </MapContainer>
    </div>
  )
}
