import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { trianglesFromFbx } from '../ui/loadFbx'

describe('FBX import fixture', () => {
  it('parses a known ASCII FBX cube into a fitted triangle mesh with undoable geometry', async () => {
    const path = fileURLToPath(new URL('./fixtures/cube-ascii.fbx', import.meta.url))
    const bytes = readFileSync(path)
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const triangles = await trianglesFromFbx(buffer as ArrayBuffer)
    expect(triangles).not.toBeNull()
    expect(triangles!.positions.length).toBeGreaterThanOrEqual(9)
    expect(triangles!.positions.length % 3).toBe(0)
    expect(triangles!.indices.length).toBeGreaterThanOrEqual(3)
    expect(triangles!.indices.length % 3).toBe(0)
    const vertexCount = triangles!.positions.length / 3
    for (const index of triangles!.indices) {
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(vertexCount)
    }
    // fitTriangles centres and normalises the largest dimension to 1.
    const xs = triangles!.positions.filter((_, index) => index % 3 === 0)
    const ys = triangles!.positions.filter((_, index) => index % 3 === 1)
    const zs = triangles!.positions.filter((_, index) => index % 3 === 2)
    const spans = [
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      Math.max(...zs) - Math.min(...zs),
    ]
    expect(Math.max(...spans)).toBeCloseTo(1, 5)
  })
})
