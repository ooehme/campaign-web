import { GeoJSON, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import type { Area, Task } from '../types/models'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]

export function MapPanel({ tasks, areas }: { tasks: Task[]; areas: Area[] }) {
  const firstTaskWithCoordinates = tasks.find((task) => typeof task.latitude === 'number' && typeof task.longitude === 'number')
  const center: [number, number] = firstTaskWithCoordinates
    ? [firstTaskWithCoordinates.latitude as number, firstTaskWithCoordinates.longitude as number]
    : DEFAULT_CENTER

  return (
    <div className="h-96 overflow-hidden rounded border border-slate-200">
      <MapContainer center={center} zoom={6} className="h-full w-full">
        <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
        {tasks
          .filter((task) => typeof task.latitude === 'number' && typeof task.longitude === 'number')
          .map((task) => (
            <Marker key={task.id} position={[task.latitude as number, task.longitude as number]}>
              <Popup>
                <strong>{task.title}</strong>
                <br />
                Status: {task.status}
              </Popup>
            </Marker>
          ))}
        {areas
          .filter((area) => area.geojson && Array.isArray(area.geojson.coordinates))
          .map((area) => (
            <GeoJSON key={area.id} data={area.geojson as GeoJSON.GeoJsonObject} />
          ))}
      </MapContainer>
    </div>
  )
}
