import test from 'node:test'
import assert from 'node:assert/strict'
import { deleteVertex, getEditableMidpoints, getEditableVertices, insertMidpoint, moveVertex } from './areaEditorGeometry.js'

test('polygon vertices and midpoint editing keeps polygon type and closure', () => {
  const polygon = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 0]]] }
  const vertices = getEditableVertices(polygon)
  assert.equal(vertices.length, 3)
  const moved = moveVertex(polygon, vertices[0], [1, 1])
  assert.deepEqual(moved.coordinates[0][0], [1, 1])
  assert.deepEqual(moved.coordinates[0][moved.coordinates[0].length - 1], [1, 1])
  const midpoint = getEditableMidpoints(moved)[0]
  const inserted = insertMidpoint(moved, midpoint)
  assert.equal(inserted.type, 'Polygon')
  assert.equal(inserted.coordinates[0].length, 5)
})

test('multipolygon edits target only selected polygon/ring and preserve multipolygon', () => {
  const multi = {
    type: 'MultiPolygon',
    coordinates: [
      [[[0, 0], [2, 0], [2, 2], [0, 0]]],
      [[[10, 10], [12, 10], [12, 12], [10, 10]]],
    ],
  }
  const target = getEditableVertices(multi).find((vertex) => vertex.polygonIndex === 1 && vertex.vertexIndex === 1)
  assert.ok(target)
  const moved = moveVertex(multi, target, [13, 10])
  assert.equal(moved.type, 'MultiPolygon')
  assert.deepEqual(moved.coordinates[1][0][1], [13, 10])
  assert.deepEqual(moved.coordinates[0][0][1], [2, 0])
  const deleted = deleteVertex(moved, { ...target, vertexIndex: 0 })
  assert.equal(deleted.coordinates[1][0].length, 4)
})
