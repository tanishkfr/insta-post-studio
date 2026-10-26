import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  gizmoFrame,
  initialState,
  objectById,
  type ObjectId,
  type State,
} from './model'
import { reduce } from './reduce'
import { createEditor } from './store'
import { restPose } from '../ui/projectMesh'

function requireObject(state: State, index: number) {
  const object = state.document.objects[index]
  assert.ok(object, `expected object at ${index}`)
  return object
}

test('add offsets each spawn on x and z', () => {
  const editor = createEditor()
  editor.dispatch({ kind: 'add', shape: 'box' })
  editor.dispatch({ kind: 'add', shape: 'sphere' })
  const objects = editor.snapshot().document.objects
  const a = objects[0]
  const b = objects[1]
  assert.ok(a && b)
  assert.equal(a.transform.position.x, 0)
  assert.equal(a.transform.position.z, 0)
  assert.equal(b.transform.position.x, 0.8)
  assert.equal(b.transform.position.z, 0.8)
  assert.notEqual(a.transform.position.x, b.transform.position.x)
  assert.equal(a.name, 'Box 1')
  assert.equal(b.name, 'Sphere 1')
})

test('select writes session only', () => {
  const editor = createEditor()
  editor.dispatch({ kind: 'add', shape: 'box' })
  editor.dispatch({ kind: 'add', shape: 'sphere' })
  const a = editor.snapshot().document.objects[0]
  const b = editor.snapshot().document.objects[1]
  assert.ok(a && b)
  editor.dispatch({ kind: 'select', id: a.id })
  assert.equal(editor.snapshot().selection, a.id)
  const pastAfterSelect = editor.snapshot().canUndo
  editor.dispatch({ kind: 'select', id: b.id })
  assert.equal(editor.snapshot().selection, b.id)
  assert.equal(editor.snapshot().canUndo, pastAfterSelect)
  editor.dispatch({ kind: 'select', id: a.id })
  editor.dispatch({ kind: 'undo' })
  assert.equal(editor.snapshot().selection, a.id)
  assert.equal(editor.snapshot().document.objects.length, 1)
  assert.equal(editor.snapshot().document.objects[0]?.id, a.id)
})

test('negative form is undoable and stays on that object', () => {
  const editor = createEditor()
  editor.dispatch({ kind: 'add', shape: 'box' })
  editor.dispatch({ kind: 'add', shape: 'sphere' })
  const box = editor.snapshot().document.objects[0]
  const sphere = editor.snapshot().document.objects[1]
  assert.ok(box && sphere)
  assert.equal(box.form, 'positive')
  editor.dispatch({ kind: 'select', id: sphere.id })
  editor.dispatch({ kind: 'setForm', form: 'negative' })
  assert.equal(editor.snapshot().document.objects[1]?.form, 'negative')
  assert.equal(editor.snapshot().document.objects[0]?.form, 'positive')
  editor.dispatch({ kind: 'undo' })
  assert.equal(editor.snapshot().selection, sphere.id)
  assert.equal(editor.snapshot().document.objects[1]?.form, 'positive')
})

test('cone spawn, color, and flip are undoable', () => {
  const editor = createEditor()
  editor.dispatch({ kind: 'add', shape: 'cone' })
  const cone = editor.snapshot().document.objects[0]
  assert.ok(cone)
  assert.equal(cone.name, 'Cone 1')
  assert.equal(cone.color, '#C4847A')
  editor.dispatch({ kind: 'setColor', color: '#3B82F6' })
  assert.equal(editor.snapshot().document.objects[0]?.color, '#3B82F6')
  editor.dispatch({ kind: 'flip', axis: 'y' })
  assert.equal(editor.snapshot().document.objects[0]?.transform.rotation.y, -180)
  editor.dispatch({ kind: 'undo' })
  assert.equal(editor.snapshot().document.objects[0]?.transform.rotation.y, 0)
  editor.dispatch({ kind: 'undo' })
  assert.equal(editor.snapshot().document.objects[0]?.color, '#C4847A')
})

test('array, mirror, and deform undo as one step each', () => {
  const editor = createEditor()
  editor.dispatch({ kind: 'add', shape: 'box' })
  editor.dispatch({ kind: 'array', layout: 'line', axis: 'x', count: 3, gap: 1.4, seed: 1, jitter: 0 })
  assert.equal(editor.snapshot().document.objects.length, 1)
  assert.equal(editor.snapshot().document.objects[0]?.array?.count, 3)
  assert.equal(editor.snapshot().document.objects[0]?.array?.gap, 1.4)
  editor.dispatch({ kind: 'array', layout: 'line', axis: 'x', count: 5, gap: 1.4, seed: 1, jitter: 0 })
  assert.equal(editor.snapshot().document.objects[0]?.array?.count, 5)
  editor.dispatch({ kind: 'undo' })
  assert.equal(editor.snapshot().document.objects[0]?.array?.count, 3)
  editor.dispatch({ kind: 'undo' })
  assert.equal(editor.snapshot().document.objects[0]?.array, null)
  editor.dispatch({ kind: 'array', layout: 'scatter', axis: 'y', count: 6, gap: 2, seed: 4, jitter: 0 })
  assert.equal(editor.snapshot().document.objects[0]?.array?.layout, 'scatter')
  editor.dispatch({ kind: 'undo' })
  editor.dispatch({ kind: 'array', layout: 'radial', axis: 'y', count: 6, gap: 2, seed: 4, jitter: 0.4 })
  assert.equal(editor.snapshot().document.objects[0]?.array?.jitter, 0.4)
  assert.equal(editor.snapshot().document.objects[0]?.array?.seed, 4)
  assert.equal(editor.snapshot().document.objects.length, 1)
  assert.equal(editor.snapshot().document.objects[0]?.array?.layout, 'radial')
  assert.equal(editor.snapshot().document.objects[0]?.array?.count, 6)
  editor.dispatch({ kind: 'undo' })
  assert.equal(editor.snapshot().document.objects[0]?.array, null)
  editor.dispatch({ kind: 'mirror', axis: 'x' })
  const copy = editor.snapshot().document.objects[1]
  assert.ok(copy)
  editor.dispatch({ kind: 'select', id: copy.id })
  editor.dispatch({ kind: 'setChannel', channel: 'position', axis: 'x', value: 2 })
  editor.dispatch({ kind: 'mirror', axis: 'x' })
  assert.equal(editor.snapshot().document.objects[2]?.transform.position.x, -2)
  editor.dispatch({ kind: 'setDeform', deform: { twist: 40, taper: 0.2, noise: 0 } })
  assert.equal(editor.snapshot().document.objects[2]?.deform.twist, 40)
  editor.dispatch({ kind: 'undo' })
  assert.equal(editor.snapshot().document.objects[2]?.deform.twist, 0)
})

test('delete removes the selected object and undoes as one edit', () => {
  const editor = createEditor()
  editor.dispatch({ kind: 'add', shape: 'box' })
  editor.dispatch({ kind: 'add', shape: 'plane' })
  const box = editor.snapshot().document.objects[0]
  assert.ok(box)
  editor.dispatch({ kind: 'select', id: box.id })
  editor.dispatch({ kind: 'delete' })
  assert.equal(editor.snapshot().document.objects.length, 1)
  assert.equal(editor.snapshot().document.objects[0]?.kind, 'plane')
  assert.equal(editor.snapshot().selection, null)
  editor.dispatch({ kind: 'undo' })
  assert.equal(editor.snapshot().document.objects.length, 2)
  assert.equal(editor.snapshot().document.objects[0]?.id, box.id)
  assert.equal(editor.snapshot().selection, box.id)
})

test('setChannel undo restores the prior transform', () => {
  const editor = createEditor()
  editor.dispatch({ kind: 'add', shape: 'box' })
  editor.dispatch({ kind: 'add', shape: 'sphere' })
  const a = editor.snapshot().document.objects[0]
  const b = editor.snapshot().document.objects[1]
  assert.ok(a && b)
  editor.dispatch({ kind: 'select', id: a.id })
  editor.dispatch({
    kind: 'setChannel',
    channel: 'rotation',
    axis: 'y',
    value: 45,
  })
  assert.equal(editor.snapshot().document.objects[0]?.transform.rotation.y, 45)
  editor.dispatch({ kind: 'undo' })
  assert.equal(editor.snapshot().document.objects[0]?.transform.rotation.y, 0)
  assert.equal(editor.snapshot().document.objects[1]?.transform.rotation.y, 0)
})

test('gizmoFrame is world until the object has a user rotation', () => {
  const editor = createEditor()
  editor.dispatch({ kind: 'add', shape: 'box' })
  editor.dispatch({ kind: 'add', shape: 'sphere' })
  const a = editor.snapshot().document.objects[0]
  const b = editor.snapshot().document.objects[1]
  assert.ok(a && b)
  assert.equal(gizmoFrame(a.transform.rotation), 'world')
  assert.equal(gizmoFrame(b.transform.rotation), 'world')
  editor.dispatch({ kind: 'select', id: a.id })
  editor.dispatch({
    kind: 'setChannel',
    channel: 'rotation',
    axis: 'y',
    value: 45,
  })
  const rotated = editor.snapshot().document.objects[0]
  const untouched = editor.snapshot().document.objects[1]
  assert.ok(rotated && untouched)
  assert.equal(gizmoFrame(rotated.transform.rotation), 'local')
  assert.equal(gizmoFrame(untouched.transform.rotation), 'world')
  assert.equal(gizmoFrame({ x: 0.005, y: 0, z: 0 }), 'world')
})

test('plane rest pose is not stored in document rotation', () => {
  const editor = createEditor()
  editor.dispatch({ kind: 'add', shape: 'plane' })
  const plane = editor.snapshot().document.objects[0]
  assert.ok(plane)
  assert.deepEqual(plane.transform.rotation, { x: 0, y: 0, z: 0 })
  assert.equal(restPose('plane').rotateX, -90)
  assert.equal(restPose('box').rotateX, 0)
  assert.equal(restPose('sphere').rotateX, 0)
  assert.equal(gizmoFrame(plane.transform.rotation), 'world')
})

test('unchanged setChannel writes no history', () => {
  const editor = createEditor()
  editor.dispatch({ kind: 'add', shape: 'box' })
  const id = editor.snapshot().document.objects[0]?.id
  assert.ok(id)
  editor.dispatch({ kind: 'select', id })
  const before = editor.snapshot()
  editor.dispatch({
    kind: 'setChannel',
    channel: 'position',
    axis: 'x',
    value: 0,
  })
  const after = editor.snapshot()
  assert.equal(after.canUndo, before.canUndo)
  assert.equal(after.document.objects[0]?.transform.position.x, 0)
})

test('gizmo drag commits one replaceTransform and mesh drag does not move', () => {
  let state = reduce(initialState(), { kind: 'add', shape: 'box' })
  const id: ObjectId = requireObject(state, 0).id
  state = reduce(state, { kind: 'select', id })
  const originX = requireObject(state, 0).transform.position.x
  state = reduce(state, {
    kind: 'pointerDown',
    hit: { target: 'mesh', id, face: null },
    screen: { x: 10, y: 10 },
    button: 'left',
  })
  state = reduce(state, { kind: 'pointerMove', screen: { x: 80, y: 10 } })
  state = reduce(state, { kind: 'pointerUp' })
  assert.equal(requireObject(state, 0).transform.position.x, originX)
  assert.equal(state.pointer.owner, 'idle')

  const pastBeforeDrag = state.past.length
  state = reduce(state, {
    kind: 'pointerDown',
    hit: { target: 'gizmo', id, axis: 'x' },
    screen: { x: 0, y: 0 },
    button: 'left',
  })
  assert.equal(state.pointer.owner, 'gizmo')
  state = reduce(state, { kind: 'pointerMove', screen: { x: 100, y: 0 } })
  assert.ok(state.draft)
  assert.equal(state.draft.position.x, originX + 1)
  state = reduce(state, { kind: 'pointerUp' })
  assert.equal(state.pointer.owner, 'idle')
  assert.equal(state.draft, null)
  assert.equal(state.past.length, pastBeforeDrag + 1)
  assert.equal(requireObject(state, 0).transform.position.x, originX + 1)

  const unchanged = reduce(state, {
    kind: 'pointerDown',
    hit: { target: 'gizmo', id, axis: 'x' },
    screen: { x: 0, y: 0 },
    button: 'left',
  })
  const released = reduce(unchanged, { kind: 'pointerUp' })
  assert.equal(released.past.length, state.past.length)
  assert.ok(objectById(released.document, id))
})

test('z drags stay inverted for move, rotate, and scale', () => {
  let state = reduce(initialState(), { kind: 'add', shape: 'box' })
  const id = requireObject(state, 0).id
  function drag(tool: 'move' | 'rotate' | 'scale') {
    state = reduce(state, { kind: 'setTool', tool })
    state = reduce(state, {
      kind: 'pointerDown',
      hit: { target: 'gizmo', id, axis: 'z' },
      screen: { x: 0, y: 0 },
      button: 'left',
    })
    state = reduce(state, { kind: 'pointerMove', screen: { x: 40, y: 0 } })
    const draft = state.draft
    assert.ok(draft)
    state = reduce(state, { kind: 'pointerUp' })
    return draft
  }
  assert.equal(drag('move').position.z, -0.4)
  assert.equal(drag('rotate').rotation.z, -20)
  assert.equal(drag('scale').scale.z, 0.6)
})

test('duplicate, rename, remix, and stroke undo', () => {
  const editor = createEditor()
  editor.dispatch({ kind: 'add', shape: 'box' })
  editor.dispatch({ kind: 'array', layout: 'line', axis: 'x', count: 3, gap: 1.2, seed: 2, jitter: 0 })
  editor.dispatch({ kind: 'setDeform', deform: { twist: 10, taper: 0, noise: 0 } })
  editor.dispatch({ kind: 'duplicate' })
  assert.equal(editor.snapshot().document.objects.length, 2)
  const copy = editor.snapshot().document.objects[1]
  assert.ok(copy)
  assert.equal(copy.array?.count, 3)
  assert.equal(copy.deform.twist, 10)
  assert.equal(copy.transform.position.x, 1.2)
  assert.equal(editor.snapshot().selection, copy.id)
  editor.dispatch({ kind: 'rename', name: '  Row  ' })
  assert.equal(editor.snapshot().document.objects[1]?.name, 'Row')
  editor.dispatch({ kind: 'undo' })
  assert.notEqual(editor.snapshot().document.objects[1]?.name, 'Row')
  editor.dispatch({ kind: 'remix' })
  assert.equal(editor.snapshot().document.objects[1]?.remix, 3)
  editor.dispatch({ kind: 'undo' })
  assert.equal(editor.snapshot().document.objects[1]?.remix, null)
  editor.dispatch({
    kind: 'setStroke',
    stroke: { spacing: 0.8, points: [{ x: 0, z: 0 }, { x: 2, z: 0 }] },
  })
  assert.equal(editor.snapshot().document.objects[1]?.stroke?.points.length, 2)
  editor.dispatch({ kind: 'undo' })
  assert.equal(editor.snapshot().document.objects[1]?.stroke, null)
})
