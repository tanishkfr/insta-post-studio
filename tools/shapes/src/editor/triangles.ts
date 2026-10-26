export type TriangleMesh = {
  positions: readonly number[]
  indices: readonly number[]
}

export function fitTriangles(positions: readonly number[], indices: readonly number[]): TriangleMesh | null {
  if (positions.length < 9 || positions.length % 3 !== 0) return null
  if (indices.length < 3 || indices.length % 3 !== 0) return null
  const vertexCount = positions.length / 3
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) return null
  }

  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0
    const y = positions[i + 1] ?? 0
    const z = positions[i + 2] ?? 0
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }
  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ)
  if (!Number.isFinite(size) || size < 1e-8) return null
  const scale = 1 / size
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cz = (minZ + maxZ) / 2
  const fitted: number[] = []
  for (let i = 0; i < positions.length; i += 3) {
    fitted.push(((positions[i] ?? 0) - cx) * scale, ((positions[i + 1] ?? 0) - cy) * scale, ((positions[i + 2] ?? 0) - cz) * scale)
  }
  return { positions: fitted, indices: indices.slice() }
}

export function cloneTriangles(mesh: TriangleMesh): TriangleMesh {
  return { positions: mesh.positions.slice(), indices: mesh.indices.slice() }
}
