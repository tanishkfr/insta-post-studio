import { vec3, type Vec3 } from './model'

export type Quad = readonly [number, number, number, number]

export type QuadMesh = {
  positions: readonly Vec3[]
  faces: readonly Quad[]
}

export type LoopPair = 0 | 1

function mid(a: Vec3, b: Vec3): Vec3 {
  return vec3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x - b.x, a.y - b.y, a.z - b.z)
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
}

function scale(v: Vec3, s: number): Vec3 {
  return vec3(v.x * s, v.y * s, v.z * s)
}

function add(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x + b.x, a.y + b.y, a.z + b.z)
}

function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z)
}

function normalize(v: Vec3): Vec3 {
  const len = length(v)
  if (len < 1e-8) return vec3(0, 1, 0)
  return scale(v, 1 / len)
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t)
}

export function cloneMesh(mesh: QuadMesh): QuadMesh {
  return {
    positions: mesh.positions.map((position) => ({ ...position })),
    faces: mesh.faces.map((face) => [face[0], face[1], face[2], face[3]]),
  }
}

export function cubeMesh(): QuadMesh {
  const s = 0.5
  return {
    positions: [
      vec3(-s, -s, -s),
      vec3(s, -s, -s),
      vec3(s, s, -s),
      vec3(-s, s, -s),
      vec3(-s, -s, s),
      vec3(s, -s, s),
      vec3(s, s, s),
      vec3(-s, s, s),
    ],
    faces: [
      [4, 5, 6, 7],
      [1, 0, 3, 2],
      [1, 5, 6, 2],
      [4, 0, 3, 7],
      [3, 2, 6, 7],
      [0, 4, 5, 1],
    ],
  }
}

export function faceNormal(mesh: QuadMesh, face: Quad): Vec3 {
  const a = mesh.positions[face[0]]
  const b = mesh.positions[face[1]]
  const c = mesh.positions[face[2]]
  if (!a || !b || !c) return vec3(0, 1, 0)
  return normalize(cross(sub(b, a), sub(c, a)))
}

export function faceCenter(mesh: QuadMesh, face: Quad): Vec3 {
  const points = face.map((index) => mesh.positions[index])
  const origin = vec3(0, 0, 0)
  for (const point of points) {
    if (!point) return origin
    origin.x += point.x
    origin.y += point.y
    origin.z += point.z
  }
  return scale(origin, 1 / 4)
}

function oppositeEdges(face: Quad, pair: LoopPair): readonly [readonly [number, number], readonly [number, number]] {
  if (pair === 0) return [[face[0], face[1]], [face[3], face[2]]]
  return [[face[1], face[2]], [face[0], face[3]]]
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

function neighborAcross(mesh: QuadMesh, faceIndex: number, u: number, v: number): { face: number; pair: LoopPair } | null {
  const key = edgeKey(u, v)
  for (let index = 0; index < mesh.faces.length; index += 1) {
    if (index === faceIndex) continue
    const face = mesh.faces[index]
    if (!face) continue
    for (const pair of [0, 1] as const) {
      for (const edge of oppositeEdges(face, pair)) {
        if (edgeKey(edge[0], edge[1]) === key) return { face: index, pair }
      }
    }
  }
  return null
}

export function extrudeFace(mesh: QuadMesh, faceIndex: number, distance: number): QuadMesh | null {
  const face = mesh.faces[faceIndex]
  if (!face || distance === 0) return null
  const positions = mesh.positions.map((position) => ({ ...position }))
  const normal = scale(faceNormal(mesh, face), distance)
  const start = positions.length
  for (const index of face) {
    const point = positions[index]
    if (!point) return null
    positions.push(add(point, normal))
  }
  const cap: Quad = [start, start + 1, start + 2, start + 3]
  const sides: Quad[] = [
    [face[0], face[1], start + 1, start],
    [face[1], face[2], start + 2, start + 1],
    [face[2], face[3], start + 3, start + 2],
    [face[3], face[0], start, start + 3],
  ]
  const faces = mesh.faces.map((item, index) => (index === faceIndex ? cap : [item[0], item[1], item[2], item[3]] as Quad))
  return { positions, faces: [...faces, ...sides] }
}

export function insetFace(mesh: QuadMesh, faceIndex: number, amount: number): QuadMesh | null {
  const face = mesh.faces[faceIndex]
  if (!face || amount <= 0 || amount >= 1) return null
  const center = faceCenter(mesh, face)
  const positions = mesh.positions.map((position) => ({ ...position }))
  const start = positions.length
  for (const index of face) {
    const point = positions[index]
    if (!point) return null
    positions.push(lerp(point, center, amount))
  }
  const cap: Quad = [start, start + 1, start + 2, start + 3]
  const ring: Quad[] = [
    [face[0], face[1], start + 1, start],
    [face[1], face[2], start + 2, start + 1],
    [face[2], face[3], start + 3, start + 2],
    [face[3], face[0], start, start + 3],
  ]
  const faces = mesh.faces.map((item, index) => (index === faceIndex ? cap : [item[0], item[1], item[2], item[3]] as Quad))
  return { positions, faces: [...faces, ...ring] }
}

export function loopCut(mesh: QuadMesh, faceIndex: number, pair: LoopPair): QuadMesh | null {
  const start = mesh.faces[faceIndex]
  if (!start) return null
  const loop: { face: number; pair: LoopPair }[] = []
  const seen = new Set<number>()
  let cursor: { face: number; pair: LoopPair } | null = { face: faceIndex, pair }
  let arrived: string | null = null
  while (cursor && !seen.has(cursor.face)) {
    seen.add(cursor.face)
    loop.push(cursor)
    const face = mesh.faces[cursor.face]
    if (!face) break
    const edges = oppositeEdges(face, cursor.pair)
    const exit = edges.find((edge) => edgeKey(edge[0], edge[1]) !== arrived) ?? edges[0]
    if (!exit) break
    const next = neighborAcross(mesh, cursor.face, exit[0], exit[1])
    arrived = edgeKey(exit[0], exit[1])
    cursor = next && !seen.has(next.face) ? next : null
  }
  if (loop.length === 0) return null

  const positions = mesh.positions.map((position) => ({ ...position }))
  const mids = new Map<string, number>()
  const midpoint = (a: number, b: number): number | null => {
    const key = edgeKey(a, b)
    const existing = mids.get(key)
    if (existing !== undefined) return existing
    const pa = positions[a]
    const pb = positions[b]
    if (!pa || !pb) return null
    const index = positions.length
    positions.push(mid(pa, pb))
    mids.set(key, index)
    return index
  }

  const replacements = new Map<number, [Quad, Quad]>()
  for (const step of loop) {
    const face = mesh.faces[step.face]
    if (!face) return null
    const edges = oppositeEdges(face, step.pair)
    const p = midpoint(edges[0][0], edges[0][1])
    const q = midpoint(edges[1][0], edges[1][1])
    if (p === null || q === null) return null
    if (step.pair === 0) {
      replacements.set(step.face, [
        [face[0], p, q, face[3]],
        [p, face[1], face[2], q],
      ])
    } else {
      replacements.set(step.face, [
        [face[0], face[1], p, q],
        [q, p, face[2], face[3]],
      ])
    }
  }

  const faces: Quad[] = []
  mesh.faces.forEach((face, index) => {
    const split = replacements.get(index)
    if (split) faces.push(split[0], split[1])
    else faces.push([face[0], face[1], face[2], face[3]])
  })
  return { positions, faces }
}
