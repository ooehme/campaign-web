import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet'
import { Link } from 'react-router-dom'
import { createArea, deleteArea, listAreas } from '../api/endpoints'
import type { GeoJsonInput } from '../types/models'
import { ApiError } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/UiState'
import { can, canPermission, NO_PERMISSION_MESSAGE } from '../utils/permissions'
import { useAuth } from '../auth/AuthContext'
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../utils/constants'
import { parseGeoJsonImport } from '../utils/geojson'

const PLACEHOLDER = '{"type":"Polygon","coordinates":[[[13.40,52.52],[13.41,52.52],[13.41,52.53],[13.40,52.53],[13.40,52.52]]]}'

export function AreasPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [success, setSuccess] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualGeojson, setManualGeojson] = useState('{"type":"Polygon","coordinates":[]}')
  const [importText, setImportText] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})
  const [saveProgress, setSaveProgress] = useState('')
  const [saveErrors, setSaveErrors] = useState<string[]>([])
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['areas-pool'], queryFn: () => listAreas({ per_page: 100 }) })
  const parsedImport = useMemo(() => parseGeoJsonImport(importText), [importText])

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['areas-pool'] }); qc.invalidateQueries({ queryKey: ['campaign-areas'] }) }
  const createMutation = useMutation({ mutationFn: (v: { name: string; geojson: GeoJsonInput }) => createArea(v), onSuccess: () => { invalidate(); setSuccess('Fläche erstellt.') } })
  const del = useMutation({ mutationFn: deleteArea, onSuccess: () => { invalidate(); setSuccess('Fläche gelöscht.') } })
  const formatError = (e: unknown) => e instanceof ApiError && e.status >= 500 ? 'Serverfehler beim Laden oder Speichern der Fläche.' : e instanceof Error ? e.message : 'Fehler.'

  const allNamed = parsedImport.items.every((item) => Boolean(names[item.id]?.trim()))

  const onFileUpload = async (file?: File | null) => {
    if (!file) return
    const text = await file.text()
    setImportText(text)
    setNames({})
    setSaveErrors([])
  }

  const saveImport = async () => {
    if (!allNamed || parsedImport.items.length === 0) return
    setSaveErrors([])
    const errors: string[] = []
    for (let i = 0; i < parsedImport.items.length; i += 1) {
      const item = parsedImport.items[i]
      setSaveProgress(`Speichere Fläche ${i + 1}/${parsedImport.items.length} …`)
      try {
        await createArea({ name: names[item.id].trim(), geojson: item.feature })
      } catch (e) {
        const apiError = e as ApiError
        errors.push(`${names[item.id]}: ${apiError.status === 500 ? 'Serverfehler beim Speichern. Details im Backend-Log prüfen.' : apiError.message}`)
      }
    }
    invalidate()
    setSaveProgress('')
    if (errors.length === 0) {
      setSuccess(`${parsedImport.items.length} Fläche(n) importiert.`)
      setImportText('')
      setNames({})
    } else {
      setSaveErrors(errors)
    }
  }

  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Flächen-Pool</h1><Link className="inline-block rounded border px-3 py-2 text-sm" to="/areas/new-map">Fläche auf Karte erstellen</Link>
    {success && <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</p>}

    <div className="space-y-2 rounded border bg-white p-4">
      <h2 className="font-medium">GeoJSON importieren</h2>
      <input type="file" accept=".geojson,.json,application/json" onChange={(event) => { void onFileUpload(event.target.files?.[0]) }} />
      <textarea rows={8} placeholder="GeoJSON hier einfügen" value={importText} onChange={(e) => setImportText(e.target.value)} />
      {parsedImport.parseError && <ErrorState message={parsedImport.parseError} />}
      <p className="text-sm text-slate-600">Importierbar: {parsedImport.items.length} · Übersprungen: {parsedImport.skipped}</p>

      {parsedImport.items.length > 0 && <div className="grid gap-3 md:grid-cols-2">
        <div className="h-72 overflow-hidden rounded border"><MapContainer center={[51.1657, 10.4515]} zoom={6} className="h-full w-full"><TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
          <GeoJSON data={{ type: 'FeatureCollection', features: parsedImport.items.map((item) => item.feature) } as GeoJSON.GeoJsonObject} style={{ color: '#0f172a', fillOpacity: 0.1 }} />
        </MapContainer></div>
        <div className="space-y-2 max-h-72 overflow-auto">{parsedImport.items.map((item, index) => <div key={item.id} className="rounded border p-2">
          <input placeholder={parsedImport.items.length === 1 ? 'Name der Fläche' : `Name für Fläche ${index + 1}`} value={names[item.id] ?? ''} onChange={(e) => setNames((prev) => ({ ...prev, [item.id]: e.target.value }))} />
          <details><summary className="cursor-pointer text-xs">Eigenschaften anzeigen</summary><pre className="mt-1 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(item.properties ?? {}, null, 2)}</pre></details>
        </div>)}</div>
      </div>}
      <button className="sticky bottom-2 bg-slate-900 text-white disabled:opacity-50" disabled={!canPermission(user?.can, 'areas.create') || !allNamed || parsedImport.items.length === 0} onClick={() => void saveImport()} type="button">Import speichern</button>
      {saveProgress && <p className="text-sm text-slate-700">{saveProgress}</p>}
      {saveErrors.length > 0 && <ErrorState message={`Teilweise fehlgeschlagen: ${saveErrors.join(' | ')}`} />}
    </div>

    <div className="space-y-2 rounded border bg-white p-4">
      <h2 className="font-medium">Für Experten: GeoJSON manuell bearbeiten</h2>
      <input placeholder="Name" value={manualName} onChange={(e) => setManualName(e.target.value)} />
      <textarea rows={6} placeholder={PLACEHOLDER} value={manualGeojson} onChange={(e) => setManualGeojson(e.target.value)} />
      <button className="bg-slate-900 text-white disabled:opacity-50" disabled={!canPermission(user?.can, 'areas.create')} title={!canPermission(user?.can, 'areas.create') ? NO_PERMISSION_MESSAGE : undefined} type="button" onClick={() => { try { createMutation.mutate({ name: manualName.trim(), geojson: JSON.parse(manualGeojson) }) } catch { setSaveErrors(['GeoJSON ist kein valides JSON.']) } }}>Neue globale Fläche erstellen</button>
    </div>

    {isLoading && <LoadingState />}
    {isError && <ErrorState message={formatError(error)} />}
    {createMutation.isError && <ErrorState message={formatError(createMutation.error)} />}
    {data && data.data.length === 0 && <EmptyState message="Noch keine Flächen vorhanden." />}
    {data?.data.map((area) => <div key={area.id} className="rounded border bg-white p-3"><p className="font-medium"><Link className="text-blue-700" to={`/areas/${area.id}`}>{area.name}</Link></p><p className="text-xs text-slate-500">ID: {area.id}</p><p className="text-xs text-slate-500">GeoJSON: {area.geojson ? JSON.stringify(area.geojson).slice(0, 120) : 'Keine Geometrie'}</p><div className="mt-2 flex gap-2"><Link className={`border px-3 py-1 text-sm ${!can(area.can?.update) ? 'pointer-events-none opacity-50' : ''}`} title={!can(area.can?.update) ? NO_PERMISSION_MESSAGE : undefined} to={`/areas/${area.id}/edit`}>Bearbeiten</Link><button type="button" className="bg-red-600 text-white disabled:opacity-50" disabled={!can(area.can?.delete)} title={!can(area.can?.delete) ? NO_PERMISSION_MESSAGE : undefined} onClick={() => window.confirm(`Fläche "${area.name}" löschen?`) && del.mutate(area.id)}>Löschen</button></div></div>)}
  </section>
}
