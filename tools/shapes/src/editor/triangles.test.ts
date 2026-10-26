import { describe, expect, it } from 'vitest'
import { fitTriangles } from './triangles'

describe('fitTriangles', () => {
  it('centers a mesh and scales its longest side to 1', () => {
    const mesh = fitTriangles([0, 0, 0, 2, 0, 0, 0, 4, 0], [0, 1, 2])
    expect(mesh).not.toBeNull()
    if (!mesh) return
    const xs = [mesh.positions[0], mesh.positions[3], mesh.positions[6]]
    const ys = [mesh.positions[1], mesh.positions[4], mesh.positions[7]]
    const max = Math.max(...xs.map((value) => Math.abs(value ?? 0)), ...ys.map((value) => Math.abs(value ?? 0)))
    expect(max).toBeCloseTo(0.5)
    const finiteX = xs.filter((value): value is number => value !== undefined)
    expect(Math.min(...finiteX) + Math.max(...finiteX)).toBeCloseTo(0)
  })

  it('rejects an index that points past the vertices', () => {
    expect(fitTriangles([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 3])).toBeNull()
  })
})
