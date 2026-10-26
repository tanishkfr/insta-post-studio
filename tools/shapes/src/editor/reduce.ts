import {
  applyEdit,
  cloneTransform,
  cloneVec3,
  createObjectId,
  gizmoFrame,
  identityDeform,
  invertEdit,
  localAxis,
  objectById,
  spawnName,
  spawnTransform,
  transformsEqual,
  type ArrayRule,
  type Axis,
  type Deform,
  type Edit,
  type GizmoTool,
  type Intent,
  type ShapeObject,
  type State,
  type QuadMesh,
  type Transform,
  type Vec3,
} from './model'
import { cloneMesh, cubeMesh, extrudeFace, insetFace, loopCut } from './mesh'
import { cloneTriangles, fitTriangles } from './triangles'
import { KIND_MATTE } from '../theme'

function pushEdit(state: State, edit: Edit): State {
  return {
    ...state,
    document: applyEdit(state.document, edit),
    past: [...state.past, edit],
    future: [],
  }
}

function idlePointer(state: State): State {
  if (state.pointer.owner === 'idle' && state.draft === null) return state
  return {
    ...state,
    pointer: { owner: 'idle' },
    draft: null,
  }
}

function dropMissingSelection(state: State): State {
  if (state.selection === null) return state
  if (objectById(state.document, state.selection)) return state
  return { ...state, selection: null }
}

function setAxis(vec: Vec3, axis: Axis, value: number): Vec3 {
  const next = cloneVec3(vec)
  next[axis] = value
  return next
}

function draftFromPointer(origin: Transform, tool: GizmoTool, axis: Axis, dx: number, dy: number): Transform {
  const pixels = axis === 'y' ? -dy : axis === 'z' ? -dx : dx
  const next = cloneTransform(origin)
  if (tool === 'move') {
    const delta = pixels * 0.01
    if (gizmoFrame(origin.rotation) === 'local') {
      const dir = localAxis(origin.rotation, axis)
      next.position = {
        x: origin.position.x + dir.x * delta,
        y: origin.position.y + dir.y * delta,
        z: origin.position.z + dir.z * delta,
      }
      return next
    }
    next.position = setAxis(origin.position, axis, origin.position[axis] + delta)
    return next
  }
  if (tool === 'rotate') {
    next.rotation = setAxis(origin.rotation, axis, origin.rotation[axis] + pixels * 0.5)
    return next
  }
  const scaled = origin.scale[axis] + pixels * 0.01
  next.scale = setAxis(origin.scale, axis, scaled > 0 ? scaled : 0.01)
  return next
}

function addObject(state: State, shape: Intent & { kind: 'add' }): State {
  const objectCount = state.document.objects.length
  const object = {
    id: createObjectId(state.nextSerial),
    kind: shape.shape,
    name: spawnName(shape.shape, state.document.objects),
    form: 'positive' as const,
    color: KIND_MATTE[shape.shape],
    deform: identityDeform(),
    array: null,
    stroke: null,
    remix: null,
    mesh: shape.shape === 'custom' ? cubeMesh() : null,
    triangles: null,
    transform: spawnTransform(objectCount),
  }
  const edit: Edit = {
    kind: 'insert',
    index: objectCount,
    object,
  }
  return {
    ...pushEdit(state, edit),
    selection: object.id,
    activeFace: object.mesh ? 0 : null,
    pointer: { owner: 'idle' },
    draft: null,
    nextSerial: state.nextSerial + 1,
  }
}

function addFbx(state: State, intent: Intent & { kind: 'addFbx' }): State {
  const triangles = fitTriangles(intent.triangles.positions, intent.triangles.indices)
  if (!triangles) return state
  const objectCount = state.document.objects.length
  const trimmed = intent.name.replace(/\.fbx$/i, '').trim().slice(0, 32)
  const object = {
    id: createObjectId(state.nextSerial),
    kind: 'fbx' as const,
    name: trimmed.length > 0 ? trimmed : spawnName('fbx', state.document.objects),
    form: 'positive' as const,
    color: KIND_MATTE.fbx,
    deform: identityDeform(),
    array: null,
    stroke: null,
    remix: null,
    mesh: null,
    triangles,
    transform: spawnTransform(objectCount),
  }
  const edit: Edit = { kind: 'insert', index: objectCount, object }
  return {
    ...pushEdit(state, edit),
    selection: object.id,
    activeFace: null,
    pointer: { owner: 'idle' },
    draft: null,
    nextSerial: state.nextSerial + 1,
  }
}

function meshEqual(a: QuadMesh | null, b: QuadMesh | null): boolean {
  if (a === b) return true
  if (!a || !b || a.positions.length !== b.positions.length || a.faces.length !== b.faces.length) return false
  return true
}

function modelFace(state: State, op: 'extrude' | 'inset' | 'loopCut'): State {
  if (state.selection === null || state.activeFace === null) return state
  const object = objectById(state.document, state.selection)
  if (!object?.mesh) return state
  const next =
    op === 'extrude'
      ? extrudeFace(object.mesh, state.activeFace, 0.35)
      : op === 'inset'
        ? insetFace(object.mesh, state.activeFace, 0.35)
        : loopCut(object.mesh, state.activeFace, 0)
  if (!next || meshEqual(object.mesh, next)) return state
  const edit: Edit = { kind: 'setMesh', id: object.id, from: cloneMesh(object.mesh), to: next }
  return pushEdit(state, edit)
}

function deleteSelected(state: State): State {
  if (state.selection === null) return state
  const index = state.document.objects.findIndex((object) => object.id === state.selection)
  const object = state.document.objects[index]
  if (index < 0 || !object) return state
  const edit: Edit = { kind: 'remove', index, object }
  return dropMissingSelection({
    ...pushEdit(state, edit),
    selection: null,
    pointer: { owner: 'idle' },
    draft: null,
  })
}

function setObjectForm(state: State, intent: Intent & { kind: 'setForm' }): State {
  if (state.selection === null) return state
  const object = objectById(state.document, state.selection)
  if (!object || object.form === intent.form) return state
  const edit: Edit = { kind: 'setForm', id: object.id, from: object.form, to: intent.form }
  return pushEdit(state, edit)
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

function setObjectColor(state: State, intent: Intent & { kind: 'setColor' }): State {
  if (state.selection === null || !isHexColor(intent.color)) return state
  const object = objectById(state.document, state.selection)
  if (!object || object.color === intent.color) return state
  const edit: Edit = { kind: 'setColor', id: object.id, from: object.color, to: intent.color }
  return pushEdit(state, edit)
}

function wrapDegrees(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180
}

function flipAxis(state: State, intent: Intent & { kind: 'flip' }): State {
  if (state.selection === null) return state
  const object = objectById(state.document, state.selection)
  if (!object) return state
  const to = cloneTransform(object.transform)
  to.rotation[intent.axis] = wrapDegrees(to.rotation[intent.axis] + 180)
  const edit: Edit = {
    kind: 'replaceTransform',
    id: object.id,
    from: cloneTransform(object.transform),
    to,
  }
  return pushEdit(state, edit)
}

function deformEqual(a: Deform, b: Deform): boolean {
  return a.twist === b.twist && a.taper === b.taper && a.noise === b.noise
}

function setObjectDeform(state: State, intent: Intent & { kind: 'setDeform' }): State {
  if (state.selection === null) return state
  const object = objectById(state.document, state.selection)
  if (!object || deformEqual(object.deform, intent.deform)) return state
  const edit: Edit = { kind: 'setDeform', id: object.id, from: { ...object.deform }, to: { ...intent.deform } }
  return pushEdit(state, edit)
}

function mirroredTransform(source: ShapeObject, axis: Axis): ShapeObject['transform'] {
  const transform = cloneTransform(source.transform)
  transform.position[axis] = -transform.position[axis]
  if (axis === 'x') {
    transform.rotation.y = -transform.rotation.y
    transform.rotation.z = -transform.rotation.z
  } else if (axis === 'y') {
    transform.rotation.x = -transform.rotation.x
    transform.rotation.z = -transform.rotation.z
  } else {
    transform.rotation.x = -transform.rotation.x
    transform.rotation.y = -transform.rotation.y
  }
  return transform
}

function copyObject(state: State, source: ShapeObject, transform: ShapeObject['transform']): ShapeObject {
  return {
    id: createObjectId(state.nextSerial),
    kind: source.kind,
    name: spawnName(source.kind, state.document.objects),
    form: source.form,
    color: source.color,
    deform: { ...source.deform },
    array: null,
    stroke: null,
    remix: null,
    mesh: source.mesh ? cloneMesh(source.mesh) : null,
    triangles: source.triangles ? cloneTriangles(source.triangles) : null,
    transform,
  }
}

function arrayRuleEqual(a: ArrayRule | null, b: ArrayRule | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.layout === b.layout &&
    a.axis === b.axis &&
    a.count === b.count &&
    a.gap === b.gap &&
    a.seed === b.seed &&
    a.jitter === b.jitter
  )
}

function setArrayRule(state: State, intent: Intent & { kind: 'array' }): State {
  if (state.selection === null) return state
  const source = objectById(state.document, state.selection)
  if (!source) return state
  const count = Math.round(intent.count)
  const seed = Math.round(intent.seed)
  const jitter = Math.min(1, Math.max(0, intent.jitter))
  if (!source || !Number.isFinite(count) || !Number.isFinite(intent.gap) || !Number.isFinite(seed) || !Number.isFinite(intent.jitter)) {
    return state
  }
  const next =
    count < 2
      ? null
      : { layout: intent.layout, axis: intent.axis, count: Math.min(count, 20), gap: intent.gap, seed, jitter }
  if (arrayRuleEqual(source.array, next)) return state
  const edit: Edit = { kind: 'setArray', id: source.id, from: source.array ? { ...source.array } : null, to: next }
  return pushEdit(state, edit)
}

function mirrorCopy(state: State, intent: Intent & { kind: 'mirror' }): State {
  if (state.selection === null) return state
  const source = objectById(state.document, state.selection)
  if (!source) return state
  const copy = copyObject(state, source, mirroredTransform(source, intent.axis))
  const edit: Edit = { kind: 'insert', index: state.document.objects.length, object: copy }
  return {
    ...pushEdit(state, edit),
    selection: copy.id,
    nextSerial: state.nextSerial + 1,
    pointer: { owner: 'idle' },
    draft: null,
  }
}

function setChannel(state: State, intent: Intent & { kind: 'setChannel' }): State {
  if (state.selection === null) return state
  const object = objectById(state.document, state.selection)
  if (!object) return state
  if (intent.channel === 'scale' && intent.value <= 0) return state
  const current = object.transform[intent.channel][intent.axis]
  if (current === intent.value) return state
  const from = cloneTransform(object.transform)
  const to = cloneTransform(object.transform)
  to[intent.channel] = setAxis(to[intent.channel], intent.axis, intent.value)
  const edit: Edit = {
    kind: 'replaceTransform',
    id: object.id,
    from,
    to,
  }
  return pushEdit(state, edit)
}

function pointerDown(state: State, intent: Intent & { kind: 'pointerDown' }): State {
  if (state.pointer.owner !== 'idle') return state
  const { hit, screen, button } = intent
  if (button === 'right' || button === 'middle') {
    return { ...state, pointer: { owner: 'camera', gesture: 'pan' }, draft: null }
  }
  if (button !== 'left') return state
  if (hit.target === 'gizmo') {
    const object = objectById(state.document, hit.id)
    if (!object) return state
    return {
      ...state,
      selection: hit.id,
      pointer: {
        owner: 'gizmo',
        id: hit.id,
        tool: state.tool,
        origin: cloneTransform(object.transform),
        axis: hit.axis,
        start: { x: screen.x, y: screen.y },
      },
      draft: cloneTransform(object.transform),
    }
  }
  if (hit.target === 'mesh') {
    const object = objectById(state.document, hit.id)
    const faceCount = object?.mesh?.faces.length ?? 0
    const face = object?.mesh && hit.face !== null && hit.face >= 0 && hit.face < faceCount ? hit.face : object?.mesh ? 0 : null
    if (state.selection === hit.id && state.activeFace === face && state.draft === null) return state
    return {
      ...state,
      selection: hit.id,
      activeFace: face,
      pointer: { owner: 'idle' },
      draft: null,
    }
  }
  return { ...state, pointer: { owner: 'camera', gesture: 'orbit' }, draft: null }
}

function pointerMove(state: State, intent: Intent & { kind: 'pointerMove' }): State {
  if (state.pointer.owner === 'gizmo') {
    const { origin, tool, axis, start } = state.pointer
    const dx = intent.screen.x - start.x
    const dy = intent.screen.y - start.y
    return {
      ...state,
      draft: draftFromPointer(origin, tool, axis, dx, dy),
    }
  }
  if (state.pointer.owner === 'camera') return state
  return state
}

function pointerUp(state: State): State {
  if (state.pointer.owner === 'gizmo') {
    const { id, origin } = state.pointer
    const draft = state.draft
    const released = idlePointer(state)
    if (!draft || transformsEqual(origin, draft)) return released
    const edit: Edit = {
      kind: 'replaceTransform',
      id,
      from: cloneTransform(origin),
      to: cloneTransform(draft),
    }
    return pushEdit(released, edit)
  }
  if (state.pointer.owner === 'idle' && state.draft === null) return state
  return idlePointer(state)
}

function cloneStroke(stroke: ShapeObject['stroke']): ShapeObject['stroke'] {
  if (!stroke) return null
  return { spacing: stroke.spacing, points: stroke.points.map((point) => ({ ...point })) }
}

function duplicateSelected(state: State): State {
  if (state.selection === null) return state
  const source = objectById(state.document, state.selection)
  if (!source) return state
  const index = state.document.objects.findIndex((object) => object.id === source.id)
  const transform = cloneTransform(source.transform)
  transform.position.x += 1.2
  const copy = copyObject(state, source, transform)
  copy.array = source.array ? { ...source.array } : null
  copy.stroke = cloneStroke(source.stroke)
  copy.remix = source.remix
  const edit: Edit = { kind: 'insert', index: index + 1, object: copy }
  return {
    ...pushEdit(state, edit),
    selection: copy.id,
    pointer: { owner: 'idle' },
    draft: null,
    nextSerial: state.nextSerial + 1,
  }
}

function renameSelected(state: State, intent: Intent & { kind: 'rename' }): State {
  if (state.selection === null) return state
  const object = objectById(state.document, state.selection)
  const name = intent.name.trim().slice(0, 32)
  if (!object || name.length === 0 || object.name === name) return state
  const edit: Edit = { kind: 'setName', id: object.id, from: object.name, to: name }
  return pushEdit(state, edit)
}

function remixSelected(state: State): State {
  if (state.selection === null) return state
  const object = objectById(state.document, state.selection)
  if (!object || !object.array || object.array.count < 2) return state
  const next = (object.remix ?? object.array.seed) + 1
  if (object.remix === next) return state
  const edit: Edit = { kind: 'setRemix', id: object.id, from: object.remix, to: next }
  return pushEdit(state, edit)
}

function strokeEqual(a: ShapeObject['stroke'], b: ShapeObject['stroke']): boolean {
  if (a === b) return true
  if (!a || !b || a.spacing !== b.spacing || a.points.length !== b.points.length) return false
  return a.points.every((point, index) => point.x === b.points[index]?.x && point.z === b.points[index]?.z)
}

function setStroke(state: State, intent: Intent & { kind: 'setStroke' }): State {
  if (state.selection === null) return state
  const object = objectById(state.document, state.selection)
  if (!object) return state
  const next = intent.stroke && intent.stroke.points.length >= 2 ? cloneStroke(intent.stroke) : null
  if (strokeEqual(object.stroke, next)) return state
  const edit: Edit = { kind: 'setStroke', id: object.id, from: cloneStroke(object.stroke), to: next }
  return pushEdit(state, edit)
}

function selectionForHistory(document: State['document'], edit: Edit, direction: 'undo' | 'redo'): State['selection'] {
  if (
    edit.kind === 'replaceTransform' ||
    edit.kind === 'setForm' ||
    edit.kind === 'setColor' ||
    edit.kind === 'setDeform' ||
    edit.kind === 'setArray' ||
    edit.kind === 'setName' ||
    edit.kind === 'setRemix' ||
    edit.kind === 'setStroke' ||
    edit.kind === 'setMesh'
  ) {
    return edit.id
  }
  if (edit.kind === 'insert' && direction === 'redo') return edit.object.id
  if (edit.kind === 'remove' && direction === 'undo') return edit.object.id
  if (edit.kind === 'insertMany' && direction === 'redo') return edit.objects[0]?.id ?? null
  if (edit.kind === 'removeMany' && direction === 'undo') return edit.objects[0]?.id ?? null
  const neighbor = document.objects[Math.min(edit.index, document.objects.length - 1)]
  return neighbor?.id ?? null
}

function undo(state: State): State {
  const edit = state.past[state.past.length - 1]
  if (!edit) return state
  const document = applyEdit(state.document, invertEdit(edit))
  return {
    ...state,
    document,
    selection: selectionForHistory(document, edit, 'undo'),
    past: state.past.slice(0, -1),
    future: [...state.future, edit],
    pointer: { owner: 'idle' },
    draft: null,
  }
}

function redo(state: State): State {
  const edit = state.future[state.future.length - 1]
  if (!edit) return state
  const document = applyEdit(state.document, edit)
  return {
    ...state,
    document,
    selection: selectionForHistory(document, edit, 'redo'),
    past: [...state.past, edit],
    future: state.future.slice(0, -1),
    pointer: { owner: 'idle' },
    draft: null,
  }
}

export function reduce(state: State, intent: Intent): State {
  switch (intent.kind) {
    case 'add':
      return addObject(state, intent)
    case 'addFbx':
      return addFbx(state, intent)
    case 'extrude':
      return modelFace(state, 'extrude')
    case 'inset':
      return modelFace(state, 'inset')
    case 'loopCut':
      return modelFace(state, 'loopCut')
    case 'select': {
      if (state.selection === intent.id && state.pointer.owner === 'idle' && state.draft === null) {
        return state
      }
      const object = intent.id ? objectById(state.document, intent.id) : undefined
      return {
        ...state,
        selection: intent.id,
        activeFace: object?.mesh ? 0 : null,
        pointer: { owner: 'idle' },
        draft: null,
      }
    }
    case 'delete':
      return deleteSelected(state)
    case 'setTool':
      if (state.tool === intent.tool) return state
      return { ...state, tool: intent.tool }
    case 'setForm':
      return setObjectForm(state, intent)
    case 'setColor':
      return setObjectColor(state, intent)
    case 'flip':
      return flipAxis(state, intent)
    case 'array':
      return setArrayRule(state, intent)
    case 'mirror':
      return mirrorCopy(state, intent)
    case 'duplicate':
      return duplicateSelected(state)
    case 'rename':
      return renameSelected(state, intent)
    case 'remix':
      return remixSelected(state)
    case 'setStroke':
      return setStroke(state, intent)
    case 'setDrawing':
      if (state.drawingStroke === intent.enabled) return state
      return { ...state, drawingStroke: intent.enabled, strokeDraft: intent.enabled ? state.strokeDraft : null }
    case 'strokeDraft':
      return { ...state, strokeDraft: intent.points }
    case 'setDeform':
      return setObjectDeform(state, intent)
    case 'setShade':
      if (state.shade === intent.shade) return state
      return { ...state, shade: intent.shade }
    case 'setInkColor':
      if (!isHexColor(intent.color) || state.inkColor === intent.color) return state
      return { ...state, inkColor: intent.color }
    case 'setGizmo':
      if (state.showGizmo === intent.enabled) return state
      return { ...state, showGizmo: intent.enabled }
    case 'setWireframe':
      if (state.wireframe === intent.enabled) return state
      return { ...state, wireframe: intent.enabled }
    case 'setLight':
      if (state.light === intent.light) return state
      return { ...state, light: intent.light }
    case 'setChannel':
      return setChannel(state, intent)
    case 'pointerDown':
      return pointerDown(state, intent)
    case 'pointerMove':
      return pointerMove(state, intent)
    case 'pointerUp':
      return pointerUp(state)
    case 'undo':
      return undo(state)
    case 'redo':
      return redo(state)
    default: {
      const _exhaustive: never = intent
      return _exhaustive
    }
  }
}
