import {
  defaultCameraState,
  identityDeform,
  type ArrayRule,
  type CameraState,
  type Deform,
  type Edit,
  type GizmoTool,
  type LightPreset,
  type ObjectId,
  type Quad,
  type QuadMesh,
  type Shade,
  type ShapeDocument,
  type ShapeKind,
  type ShapeObject,
  type State,
  type StrokePath,
  type Transform,
  type Vec3,
} from './model'
import type { TriangleMesh } from './triangles'

export const SHAPES_SOURCE_VERSION = '1.0.0'
export const SHAPES_SOURCE_MIME = 'application/vnd.studio.shapes+json'

/**
 * Bumped only when the Shapes source document changes incompatibly. The host
 * and the bridge both reject unsupported versions before touching a layer.
 */
export type ShapesSourceDocumentV1 = {
  tool: 'shapes'
  schemaVersion: typeof SHAPES_SOURCE_VERSION
  savedAt: string
  document: ShapeDocument
  selection: ObjectId | null
  activeFace: number | null
  editTool: GizmoTool
  shade: Shade
  wireframe: boolean
  inkColor: string
  showGizmo: boolean
  light: LightPreset
  camera: CameraState
  history: {
    past: Edit[]
    future: Edit[]
  }
  nextSerial: number
}

const LIMITS = {
  objects: 120,
  meshPositions: 20_000,
  meshFaces: 20_000,
  trianglePositions: 120_000,
  triangleIndices: 360_000,
  strokePoints: 2_000,
  history: 400,
  name: 160,
} as const

const KINDS: readonly ShapeKind[] = [
  'box',
  'sphere',
  'plane',
  'cone',
  'cylinder',
  'torus',
  'capsule',
  'custom',
  'fbx',
]
const AXES = ['x', 'y', 'z'] as const
const TOOLS: readonly GizmoTool[] = ['move', 'rotate', 'scale']
const SHADES: readonly Shade[] = ['toon', 'ink', 'flat']
const LIGHTS: readonly LightPreset[] = ['studio', 'soft', 'rim']
const OBJECT_ID = /^obj-(\d+)$/

export class ShapesSourceStateError extends Error {
  readonly code = 'SHAPES_SOURCE_STATE_ERROR' as const

  constructor(message: string) {
    super(message)
    this.name = 'ShapesSourceStateError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(message: string): never {
  throw new ShapesSourceStateError(message)
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be a finite number.`)
  return value
}

function bounded(value: unknown, label: string, min: number, max: number): number {
  const number = finite(value, label)
  if (number < min || number > max) fail(`${label} is outside the supported range.`)
  return number
}

function integer(value: unknown, label: string, min: number, max: number): number {
  const number = finite(value, label)
  if (!Number.isInteger(number) || number < min || number > max) fail(`${label} must be a valid integer.`)
  return number
}

function oneOf<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
    fail(`${label} is not a supported value.`)
  }
  return value as T
}

function readText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.length > max) fail(`${label} is malformed.`)
  return value
}

function readColor(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) fail(`${label} must be a hex colour.`)
  return value
}

function readVec3(value: unknown, label: string): Vec3 {
  if (!isRecord(value)) fail(`${label} is malformed.`)
  return {
    x: finite(value.x, `${label}.x`),
    y: finite(value.y, `${label}.y`),
    z: finite(value.z, `${label}.z`),
  }
}

function readTransform(value: unknown, label: string): Transform {
  if (!isRecord(value)) fail(`${label} is malformed.`)
  const position = readVec3(value.position, `${label}.position`)
  const rotation = readVec3(value.rotation, `${label}.rotation`)
  const scale = readVec3(value.scale, `${label}.scale`)
  if (scale.x <= 0 || scale.y <= 0 || scale.z <= 0) fail(`${label} scale must be positive.`)
  return { position, rotation, scale }
}

function readDeform(value: unknown, label: string): Deform {
  if (!isRecord(value)) fail(`${label} is malformed.`)
  return {
    twist: bounded(value.twist, `${label}.twist`, -180, 180),
    taper: bounded(value.taper, `${label}.taper`, -1, 1),
    noise: bounded(value.noise, `${label}.noise`, 0, 0.4),
  }
}

function readArrayRule(value: unknown, label: string): ArrayRule | null {
  if (value === null) return null
  if (!isRecord(value)) fail(`${label} is malformed.`)
  return {
    layout: oneOf(value.layout, ['line', 'radial', 'scatter'] as const, `${label}.layout`),
    axis: oneOf(value.axis, AXES, `${label}.axis`),
    count: integer(value.count, `${label}.count`, 1, 20),
    gap: bounded(value.gap, `${label}.gap`, -1_000, 1_000),
    seed: integer(value.seed, `${label}.seed`, -1_000_000_000, 1_000_000_000),
    jitter: bounded(value.jitter, `${label}.jitter`, 0, 1),
  }
}

function readStroke(value: unknown, label: string): StrokePath | null {
  if (value === null) return null
  if (!isRecord(value) || !Array.isArray(value.points)) fail(`${label} is malformed.`)
  if (value.points.length < 2 || value.points.length > LIMITS.strokePoints) {
    fail(`${label} has an unsupported number of points.`)
  }
  const points = value.points.map((point, index) => {
    if (!isRecord(point)) fail(`${label}.points[${index}] is malformed.`)
    return {
      x: finite(point.x, `${label}.points[${index}].x`),
      z: finite(point.z, `${label}.points[${index}].z`),
    }
  })
  return {
    points,
    spacing: bounded(value.spacing, `${label}.spacing`, 0.01, 1_000),
  }
}

function readQuadMesh(value: unknown, label: string): QuadMesh | null {
  if (value === null) return null
  if (!isRecord(value) || !Array.isArray(value.positions) || !Array.isArray(value.faces)) {
    fail(`${label} is malformed.`)
  }
  if (
    value.positions.length < 4 ||
    value.positions.length > LIMITS.meshPositions ||
    value.faces.length < 1 ||
    value.faces.length > LIMITS.meshFaces
  ) {
    fail(`${label} has an unsupported mesh size.`)
  }
  const positions = value.positions.map((position, index) =>
    readVec3(position, `${label}.positions[${index}]`),
  )
  const faces = value.faces.map((face, index) => {
    if (!Array.isArray(face) || face.length !== 4) fail(`${label}.faces[${index}] is not a quad.`)
    const quad = face.map((vertex, axis) =>
      integer(vertex, `${label}.faces[${index}][${axis}]`, 0, positions.length - 1),
    ) as unknown as Quad
    return quad
  })
  return { positions, faces }
}

function readTriangles(value: unknown, label: string): TriangleMesh | null {
  if (value === null) return null
  if (!isRecord(value) || !Array.isArray(value.positions) || !Array.isArray(value.indices)) {
    fail(`${label} is malformed.`)
  }
  if (
    value.positions.length < 9 ||
    value.positions.length % 3 !== 0 ||
    value.positions.length > LIMITS.trianglePositions ||
    value.indices.length < 3 ||
    value.indices.length % 3 !== 0 ||
    value.indices.length > LIMITS.triangleIndices
  ) {
    fail(`${label} has an unsupported triangle-mesh size.`)
  }
  const positions = value.positions.map((coordinate, index) =>
    finite(coordinate, `${label}.positions[${index}]`),
  )
  const vertexCount = positions.length / 3
  const indices = value.indices.map((index, position) =>
    integer(index, `${label}.indices[${position}]`, 0, vertexCount - 1),
  )
  return { positions, indices }
}

function readObject(value: unknown, label: string): ShapeObject {
  if (!isRecord(value)) fail(`${label} is malformed.`)
  const id = readText(value.id, `${label}.id`, 64)
  if (!OBJECT_ID.test(id)) fail(`${label} has an unsupported object ID.`)
  const kind = oneOf(value.kind, KINDS, `${label}.kind`)
  const mesh = readQuadMesh(value.mesh, `${label}.mesh`)
  const triangles = readTriangles(value.triangles, `${label}.triangles`)
  if (mesh && triangles) fail(`${label} cannot carry both quad and triangle meshes.`)
  const remix = value.remix === null ? null : integer(value.remix, `${label}.remix`, -1_000_000_000, 1_000_000_000)
  const object: ShapeObject = {
    id: id as ObjectId,
    kind,
    name: readText(value.name, `${label}.name`, LIMITS.name),
    form: oneOf(value.form, ['positive', 'negative'] as const, `${label}.form`),
    color: readColor(value.color, `${label}.color`),
    deform: readDeform(value.deform ?? identityDeform(), `${label}.deform`),
    array: readArrayRule(value.array, `${label}.array`),
    stroke: readStroke(value.stroke, `${label}.stroke`),
    remix,
    mesh,
    triangles,
    transform: readTransform(value.transform, `${label}.transform`),
  }
  return object
}

function readEdit(value: unknown, label: string, objects: readonly ShapeObject[]): Edit {
  if (!isRecord(value) || typeof value.kind !== 'string') fail(`${label} is malformed.`)
  const idFor = (raw: unknown): ObjectId => {
    const text = readText(raw, `${label}.id`, 64)
    if (!OBJECT_ID.test(text)) fail(`${label} has an unsupported object ID.`)
    return text as ObjectId
  }
  switch (value.kind) {
    case 'insert':
      return {
        kind: 'insert',
        index: integer(value.index, `${label}.index`, 0, LIMITS.objects * 2),
        object: readObject(value.object, `${label}.object`),
      }
    case 'remove':
      return {
        kind: 'remove',
        index: integer(value.index, `${label}.index`, 0, LIMITS.objects * 2),
        object: readObject(value.object, `${label}.object`),
      }
    case 'replaceTransform':
      return {
        kind: 'replaceTransform',
        id: idFor(value.id),
        from: readTransform(value.from, `${label}.from`),
        to: readTransform(value.to, `${label}.to`),
      }
    case 'setForm':
      return {
        kind: 'setForm',
        id: idFor(value.id),
        from: oneOf(value.from, ['positive', 'negative'] as const, `${label}.from`),
        to: oneOf(value.to, ['positive', 'negative'] as const, `${label}.to`),
      }
    case 'setColor':
      return {
        kind: 'setColor',
        id: idFor(value.id),
        from: readColor(value.from, `${label}.from`),
        to: readColor(value.to, `${label}.to`),
      }
    case 'setDeform':
      return {
        kind: 'setDeform',
        id: idFor(value.id),
        from: readDeform(value.from, `${label}.from`),
        to: readDeform(value.to, `${label}.to`),
      }
    case 'setArray':
      return {
        kind: 'setArray',
        id: idFor(value.id),
        from: readArrayRule(value.from, `${label}.from`),
        to: readArrayRule(value.to, `${label}.to`),
      }
    case 'setName':
      return {
        kind: 'setName',
        id: idFor(value.id),
        from: readText(value.from, `${label}.from`, LIMITS.name),
        to: readText(value.to, `${label}.to`, LIMITS.name),
      }
    case 'setRemix':
      return {
        kind: 'setRemix',
        id: idFor(value.id),
        from:
          value.from === null
            ? null
            : integer(value.from, `${label}.from`, -1_000_000_000, 1_000_000_000),
        to:
          value.to === null
            ? null
            : integer(value.to, `${label}.to`, -1_000_000_000, 1_000_000_000),
      }
    case 'setStroke':
      return {
        kind: 'setStroke',
        id: idFor(value.id),
        from: readStroke(value.from, `${label}.from`),
        to: readStroke(value.to, `${label}.to`),
      }
    case 'setMesh':
      return {
        kind: 'setMesh',
        id: idFor(value.id),
        from: readQuadMesh(value.from, `${label}.from`),
        to: readQuadMesh(value.to, `${label}.to`),
      }
    case 'insertMany': {
      if (!Array.isArray(value.objects) || value.objects.length > LIMITS.objects) {
        fail(`${label}.objects is malformed.`)
      }
      return {
        kind: 'insertMany',
        index: integer(value.index, `${label}.index`, 0, LIMITS.objects * 2),
        objects: value.objects.map((object, index) => readObject(object, `${label}.objects[${index}]`)),
      }
    }
    case 'removeMany': {
      if (!Array.isArray(value.objects) || value.objects.length > LIMITS.objects) {
        fail(`${label}.objects is malformed.`)
      }
      return {
        kind: 'removeMany',
        index: integer(value.index, `${label}.index`, 0, LIMITS.objects * 2),
        objects: value.objects.map((object, index) => readObject(object, `${label}.objects[${index}]`)),
      }
    }
    default:
      return fail(`${label} uses an unsupported edit kind.`)
  }
  // `objects` is intentionally unused; keep it in the signature so future
  // semantic history checks can validate object references without changing
  // every call site.
  void objects
}

function readCamera(value: unknown): CameraState {
  if (!isRecord(value)) fail('Shapes camera state is missing.')
  const camera: CameraState = {
    theta: finite(value.theta, 'camera.theta'),
    phi: bounded(value.phi, 'camera.phi', 0.12, Math.PI - 0.12),
    radius: bounded(value.radius, 'camera.radius', 2.2, 48),
    target: readVec3(value.target, 'camera.target'),
  }
  return camera
}

function readDocument(value: unknown): ShapeDocument {
  if (!isRecord(value) || !Array.isArray(value.objects)) fail('Shapes document objects are missing.')
  if (value.objects.length > LIMITS.objects) fail('Shapes document has too many objects.')
  const objects = value.objects.map((object, index) => readObject(object, `document.objects[${index}]`))
  const ids = new Set<string>()
  for (const object of objects) {
    if (ids.has(object.id)) fail(`Shapes document contains duplicate object ID ${object.id}.`)
    ids.add(object.id)
  }
  return { objects }
}

function readHistory(value: unknown, objects: readonly ShapeObject[]): { past: Edit[]; future: Edit[] } {
  if (!isRecord(value)) fail('Shapes history is missing.')
  const readStack = (raw: unknown, label: string): Edit[] => {
    if (!Array.isArray(raw) || raw.length > LIMITS.history) fail(`${label} is malformed.`)
    return raw.map((edit, index) => readEdit(edit, `${label}[${index}]`, objects))
  }
  return { past: readStack(value.past, 'history.past'), future: readStack(value.future, 'history.future') }
}

export function serializeShapesSource(state: State): ShapesSourceDocumentV1 {
  return {
    tool: 'shapes',
    schemaVersion: SHAPES_SOURCE_VERSION,
    savedAt: new Date().toISOString(),
    document: state.document,
    selection: state.selection,
    activeFace: state.activeFace,
    editTool: state.tool,
    shade: state.shade,
    wireframe: state.wireframe,
    inkColor: state.inkColor,
    showGizmo: state.showGizmo,
    light: state.light,
    camera: state.camera,
    history: {
      past: state.past,
      future: state.future,
    },
    nextSerial: state.nextSerial,
  }
}

/**
 * Validates and converts a persisted source document into the editor's native
 * state. Any malformed document throws before the caller replaces editor state,
 * so a failed reopen cannot damage the layer currently on screen.
 */
export function parseShapesSource(content: string): State {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    fail('The saved Shapes document is not valid JSON.')
  }
  if (!isRecord(parsed)) fail('The saved Shapes document is empty.')
  if (parsed.tool !== 'shapes') fail('Source state does not belong to Shapes.')
  if (parsed.schemaVersion !== SHAPES_SOURCE_VERSION) {
    fail(`Shapes source version ${String(parsed.schemaVersion)} is not supported by this editor.`)
  }

  const document = readDocument(parsed.document)
  const selection =
    parsed.selection === null
      ? null
      : (() => {
          const id = readText(parsed.selection, 'selection', 64)
          if (!document.objects.some((object) => object.id === id)) fail('Selection is not in the document.')
          return id as ObjectId
        })()
  const selected = selection ? document.objects.find((object) => object.id === selection) : undefined
  const activeFace =
    parsed.activeFace === null
      ? null
      : selected?.mesh
        ? integer(parsed.activeFace, 'activeFace', 0, selected.mesh.faces.length - 1)
        : fail('Active face requires a selected quad mesh.')
  const nextSerial = integer(parsed.nextSerial, 'nextSerial', 1, 1_000_000_000)
  let maxSerial = 0
  for (const object of document.objects) {
    const match = OBJECT_ID.exec(object.id)
    if (match) maxSerial = Math.max(maxSerial, Number(match[1]))
  }
  if (nextSerial <= maxSerial) fail('nextSerial does not cover the existing object IDs.')

  const history = readHistory(parsed.history, document.objects)

  return {
    document,
    selection,
    tool: oneOf(parsed.editTool, TOOLS, 'editTool'),
    shade: oneOf(parsed.shade, SHADES, 'shade'),
    wireframe: Boolean(parsed.wireframe),
    inkColor: readColor(parsed.inkColor, 'inkColor'),
    showGizmo: Boolean(parsed.showGizmo),
    drawingStroke: false,
    strokeDraft: null,
    light: oneOf(parsed.light, LIGHTS, 'light'),
    activeFace,
    camera: readCamera(parsed.camera),
    pointer: { owner: 'idle' },
    draft: null,
    past: history.past,
    future: history.future,
    nextSerial,
  }
}

export function defaultShapesCamera(): CameraState {
  return defaultCameraState()
}
