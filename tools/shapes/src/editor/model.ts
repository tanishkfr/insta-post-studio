import type { TriangleMesh } from './triangles'

export type ObjectId = string & { readonly __brand: 'ObjectId' }

export type ShapeKind = 'box' | 'sphere' | 'plane' | 'cone' | 'cylinder' | 'torus' | 'capsule' | 'custom' | 'fbx'

export type Quad = readonly [number, number, number, number]

export type QuadMesh = {
  positions: readonly Vec3[]
  faces: readonly Quad[]
}

export type ShapeForm = 'positive' | 'negative'

export type Shade = 'toon' | 'ink' | 'flat'

export type LightPreset = 'studio' | 'soft' | 'rim'

export type Deform = { twist: number; taper: number; noise: number }

export type ArrayLayout = 'line' | 'radial' | 'scatter'

export type ArrayRule = {
  layout: ArrayLayout
  axis: Axis
  count: number
  gap: number
  seed: number
  jitter: number
}

export type GizmoTool = 'move' | 'rotate' | 'scale'

export type Axis = 'x' | 'y' | 'z'

export type Channel = 'position' | 'rotation' | 'scale'

export type Vec3 = { x: number; y: number; z: number }

export type Transform = {
  position: Vec3
  rotation: Vec3
  scale: Vec3
}

export type StrokePoint = { x: number; z: number }

export type StrokePath = { points: StrokePoint[]; spacing: number }

export type ShapeObject = {
  id: ObjectId
  kind: ShapeKind
  name: string
  form: ShapeForm
  color: string
  deform: Deform
  array: ArrayRule | null
  stroke: StrokePath | null
  remix: number | null
  mesh: QuadMesh | null
  triangles: TriangleMesh | null
  transform: Transform
}

export type ShapeDocument = {
  objects: readonly ShapeObject[]
}

export type PointerLock =
  | { owner: 'idle' }
  | { owner: 'camera'; gesture: 'orbit' | 'pan' | 'dolly' }
  | {
      owner: 'gizmo'
      id: ObjectId
      tool: GizmoTool
      origin: Transform
      axis: Axis
      start: ScreenPoint
    }

export type Hit =
  | { target: 'empty' }
  | { target: 'mesh'; id: ObjectId; face: number | null }
  | { target: 'gizmo'; id: ObjectId; axis: Axis }

export type ScreenPoint = { x: number; y: number }

export type PointerButton = 'left' | 'middle' | 'right' | 'none'

export type Intent =
  | { kind: 'add'; shape: ShapeKind }
  | { kind: 'addFbx'; name: string; triangles: TriangleMesh }
  | { kind: 'extrude' }
  | { kind: 'inset' }
  | { kind: 'loopCut' }
  | { kind: 'select'; id: ObjectId | null }
  | { kind: 'delete' }
  | { kind: 'setTool'; tool: GizmoTool }
  | { kind: 'setForm'; form: ShapeForm }
  | { kind: 'setColor'; color: string }
  | { kind: 'flip'; axis: Axis }
  | { kind: 'array'; layout: ArrayLayout; axis: Axis; count: number; gap: number; seed: number; jitter: number }
  | { kind: 'mirror'; axis: Axis }
  | { kind: 'setDeform'; deform: Deform }
  | { kind: 'setShade'; shade: Shade }
  | { kind: 'setInkColor'; color: string }
  | { kind: 'setGizmo'; enabled: boolean }
  | { kind: 'duplicate' }
  | { kind: 'rename'; name: string }
  | { kind: 'remix' }
  | { kind: 'setStroke'; stroke: StrokePath | null }
  | { kind: 'setDrawing'; enabled: boolean }
  | { kind: 'strokeDraft'; points: StrokePoint[] | null }
  | { kind: 'setWireframe'; enabled: boolean }
  | { kind: 'setLight'; light: LightPreset }
  | { kind: 'setChannel'; channel: Channel; axis: Axis; value: number }
  | {
      kind: 'pointerDown'
      hit: Hit
      screen: ScreenPoint
      button: PointerButton
    }
  | { kind: 'pointerMove'; screen: ScreenPoint }
  | { kind: 'pointerUp' }
  | { kind: 'undo' }
  | { kind: 'redo' }

export type Edit =
  | { kind: 'insert'; index: number; object: ShapeObject }
  | { kind: 'remove'; index: number; object: ShapeObject }
  | {
      kind: 'replaceTransform'
      id: ObjectId
      from: Transform
      to: Transform
    }
  | { kind: 'setForm'; id: ObjectId; from: ShapeForm; to: ShapeForm }
  | { kind: 'setColor'; id: ObjectId; from: string; to: string }
  | { kind: 'setDeform'; id: ObjectId; from: Deform; to: Deform }
  | { kind: 'setArray'; id: ObjectId; from: ArrayRule | null; to: ArrayRule | null }
  | { kind: 'setName'; id: ObjectId; from: string; to: string }
  | { kind: 'setRemix'; id: ObjectId; from: number | null; to: number | null }
  | { kind: 'setStroke'; id: ObjectId; from: StrokePath | null; to: StrokePath | null }
  | { kind: 'setMesh'; id: ObjectId; from: QuadMesh | null; to: QuadMesh | null }
  | { kind: 'insertMany'; index: number; objects: readonly ShapeObject[] }
  | { kind: 'removeMany'; index: number; objects: readonly ShapeObject[] }

export type State = {
  document: ShapeDocument
  selection: ObjectId | null
  tool: GizmoTool
  shade: Shade
  wireframe: boolean
  inkColor: string
  showGizmo: boolean
  drawingStroke: boolean
  strokeDraft: StrokePoint[] | null
  light: LightPreset
  activeFace: number | null
  pointer: PointerLock
  draft: Transform | null
  past: Edit[]
  future: Edit[]
  nextSerial: number
}

export type Snapshot = {
  document: ShapeDocument
  selection: ObjectId | null
  tool: GizmoTool
  shade: Shade
  wireframe: boolean
  inkColor: string
  showGizmo: boolean
  drawingStroke: boolean
  strokeDraft: StrokePoint[] | null
  light: LightPreset
  activeFace: number | null
  pointer: PointerLock
  draft: Transform | null
  canUndo: boolean
  canRedo: boolean
}

export type Editor = {
  dispatch(intent: Intent): void
  snapshot(): Snapshot
  subscribe(listener: () => void): () => void
}

export type ProjectedMesh = {
  id: ObjectId
  kind: ShapeKind
  name: string
  transform: Transform
  selected: boolean
  color: string
  form: ShapeForm
  deform: Deform
  array: ArrayRule | null
  stroke: StrokePath | null
  remix: number | null
  mesh: QuadMesh | null
  triangles: TriangleMesh | null
  activeFace: number | null
}

const KIND_LABEL: Record<ShapeKind, string> = {
  box: 'Box',
  sphere: 'Sphere',
  plane: 'Plane',
  cone: 'Cone',
  cylinder: 'Cylinder',
  torus: 'Torus',
  capsule: 'Capsule',
  custom: 'Custom',
  fbx: 'FBX',
}

export function identityDeform(): Deform {
  return { twist: 0, taper: 0, noise: 0 }
}

export function createObjectId(serial: number): ObjectId {
  return `obj-${serial}` as ObjectId
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}

export function cloneVec3(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z }
}

export function cloneTransform(transform: Transform): Transform {
  return {
    position: cloneVec3(transform.position),
    rotation: cloneVec3(transform.rotation),
    scale: cloneVec3(transform.scale),
  }
}

export function identityTransform(): Transform {
  return {
    position: vec3(0, 0, 0),
    rotation: vec3(0, 0, 0),
    scale: vec3(1, 1, 1),
  }
}

export function spawnTransform(objectCount: number): Transform {
  const transform = identityTransform()
  transform.position = vec3(objectCount * 0.8, 0, objectCount * 0.8)
  return transform
}

export function spawnName(kind: ShapeKind, objects: readonly ShapeObject[]): string {
  const count = objects.filter((object) => object.kind === kind).length
  return `${KIND_LABEL[kind]} ${count + 1}`
}

export function isIdentityRotation(rotation: Vec3): boolean {
  return Math.abs(rotation.x) < 0.01 && Math.abs(rotation.y) < 0.01 && Math.abs(rotation.z) < 0.01
}

export function gizmoFrame(rotation: Vec3): 'world' | 'local' {
  return isIdentityRotation(rotation) ? 'world' : 'local'
}

export function localAxis(rotation: Vec3, axis: Axis): Vec3 {
  const x = (rotation.x * Math.PI) / 180
  const y = (rotation.y * Math.PI) / 180
  const z = (rotation.z * Math.PI) / 180
  const a = Math.cos(x)
  const b = Math.sin(x)
  const c = Math.cos(y)
  const d = Math.sin(y)
  const e = Math.cos(z)
  const f = Math.sin(z)
  const ae = a * e
  const af = a * f
  const be = b * e
  const bf = b * f
  if (axis === 'x') return { x: c * e, y: af + be * d, z: bf - ae * d }
  if (axis === 'y') return { x: -c * f, y: ae - bf * d, z: be + af * d }
  return { x: d, y: -b * c, z: a * c }
}

export function objectById(document: ShapeDocument, id: ObjectId): ShapeObject | undefined {
  return document.objects.find((object) => object.id === id)
}

export type MeshSource = {
  document: ShapeDocument
  selection: ObjectId | null
  activeFace: number | null
  pointer: PointerLock
  draft: Transform | null
}

export function displayTransform(state: MeshSource, id: ObjectId): Transform {
  if (state.pointer.owner === 'gizmo' && state.pointer.id === id && state.draft) {
    return state.draft
  }
  const object = objectById(state.document, id)
  return object ? object.transform : identityTransform()
}

export function vec3Equal(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z
}

export function transformsEqual(a: Transform, b: Transform): boolean {
  return vec3Equal(a.position, b.position) && vec3Equal(a.rotation, b.rotation) && vec3Equal(a.scale, b.scale)
}

export function cloneMeshData(mesh: QuadMesh): QuadMesh {
  return {
    positions: mesh.positions.map((position) => ({ ...position })),
    faces: mesh.faces.map((face) => [face[0], face[1], face[2], face[3]]),
  }
}

export function applyEdit(document: ShapeDocument, edit: Edit): ShapeDocument {
  switch (edit.kind) {
    case 'insert': {
      const objects = document.objects.slice()
      objects.splice(edit.index, 0, edit.object)
      return { objects }
    }
    case 'remove': {
      return {
        objects: document.objects.filter((object) => object.id !== edit.object.id),
      }
    }
    case 'replaceTransform': {
      return {
        objects: document.objects.map((object) =>
          object.id === edit.id ? { ...object, transform: cloneTransform(edit.to) } : object,
        ),
      }
    }
    case 'setForm': {
      return {
        objects: document.objects.map((object) =>
          object.id === edit.id ? { ...object, form: edit.to } : object,
        ),
      }
    }
    case 'setColor': {
      return {
        objects: document.objects.map((object) =>
          object.id === edit.id ? { ...object, color: edit.to } : object,
        ),
      }
    }
    case 'setDeform': {
      return {
        objects: document.objects.map((object) =>
          object.id === edit.id ? { ...object, deform: { ...edit.to } } : object,
        ),
      }
    }
    case 'setArray': {
      return {
        objects: document.objects.map((object) =>
          object.id === edit.id ? { ...object, array: edit.to ? { ...edit.to } : null } : object,
        ),
      }
    }
    case 'setName': {
      return {
        objects: document.objects.map((object) => (object.id === edit.id ? { ...object, name: edit.to } : object)),
      }
    }
    case 'setRemix': {
      return {
        objects: document.objects.map((object) => (object.id === edit.id ? { ...object, remix: edit.to } : object)),
      }
    }
    case 'setStroke': {
      return {
        objects: document.objects.map((object) =>
          object.id === edit.id ? { ...object, stroke: edit.to ? { spacing: edit.to.spacing, points: edit.to.points.map((point) => ({ ...point })) } : null } : object,
        ),
      }
    }
    case 'setMesh': {
      return {
        objects: document.objects.map((object) =>
          object.id === edit.id ? { ...object, mesh: edit.to ? cloneMeshData(edit.to) : null } : object,
        ),
      }
    }
    case 'insertMany': {
      const objects = document.objects.slice()
      objects.splice(edit.index, 0, ...edit.objects)
      return { objects }
    }
    case 'removeMany': {
      const ids = new Set(edit.objects.map((object) => object.id))
      return { objects: document.objects.filter((object) => !ids.has(object.id)) }
    }
    default: {
      const _exhaustive: never = edit
      return _exhaustive
    }
  }
}

export function invertEdit(edit: Edit): Edit {
  switch (edit.kind) {
    case 'insert':
      return { kind: 'remove', index: edit.index, object: edit.object }
    case 'remove':
      return { kind: 'insert', index: edit.index, object: edit.object }
    case 'replaceTransform':
      return {
        kind: 'replaceTransform',
        id: edit.id,
        from: edit.to,
        to: edit.from,
      }
    case 'setForm':
      return { kind: 'setForm', id: edit.id, from: edit.to, to: edit.from }
    case 'setColor':
      return { kind: 'setColor', id: edit.id, from: edit.to, to: edit.from }
    case 'setDeform':
      return { kind: 'setDeform', id: edit.id, from: edit.to, to: edit.from }
    case 'setArray':
      return { kind: 'setArray', id: edit.id, from: edit.to, to: edit.from }
    case 'setName':
      return { kind: 'setName', id: edit.id, from: edit.to, to: edit.from }
    case 'setRemix':
      return { kind: 'setRemix', id: edit.id, from: edit.to, to: edit.from }
    case 'setStroke':
      return { kind: 'setStroke', id: edit.id, from: edit.to, to: edit.from }
    case 'setMesh':
      return { kind: 'setMesh', id: edit.id, from: edit.to, to: edit.from }
    case 'insertMany':
      return { kind: 'removeMany', index: edit.index, objects: edit.objects }
    case 'removeMany':
      return { kind: 'insertMany', index: edit.index, objects: edit.objects }
    default: {
      const _exhaustive: never = edit
      return _exhaustive
    }
  }
}

export function initialState(): State {
  return {
    document: { objects: [] },
    selection: null,
    tool: 'move',
    shade: 'toon',
    wireframe: true,
    inkColor: '#000000',
    showGizmo: true,
    drawingStroke: false,
    strokeDraft: null,
    light: 'studio',
    activeFace: null,
    pointer: { owner: 'idle' },
    draft: null,
    past: [],
    future: [],
    nextSerial: 1,
  }
}

export function toSnapshot(state: State): Snapshot {
  return {
    document: state.document,
    selection: state.selection,
    tool: state.tool,
    shade: state.shade,
    wireframe: state.wireframe,
    inkColor: state.inkColor,
    showGizmo: state.showGizmo,
    drawingStroke: state.drawingStroke,
    strokeDraft: state.strokeDraft,
    light: state.light,
    activeFace: state.activeFace,
    pointer: state.pointer,
    draft: state.draft,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}

export function channelForTool(tool: GizmoTool): Channel {
  switch (tool) {
    case 'move':
      return 'position'
    case 'rotate':
      return 'rotation'
    case 'scale':
      return 'scale'
    default: {
      const _exhaustive: never = tool
      return _exhaustive
    }
  }
}
