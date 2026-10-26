import { describe, expect, it } from 'vitest'
import { cubeMesh, extrudeFace, faceNormal, insetFace, loopCut } from './mesh'

describe('quad mesh modelling', () => {
  it('extrudes the active face outward', () => {
    const next = extrudeFace(cubeMesh(), 0, 0.4)
    expect(next).not.toBeNull()
    if (!next) return
    expect(next.faces).toHaveLength(10)
    expect(next.positions).toHaveLength(12)
    const cap = next.faces[0]
    expect(cap).toBeDefined()
    if (!cap) return
    expect(faceNormal(next, cap).z).toBeGreaterThan(0.9)
  })

  it('insets a face into a smaller cap plus a ring', () => {
    const next = insetFace(cubeMesh(), 4, 0.3)
    expect(next?.faces).toHaveLength(10)
    expect(next?.positions).toHaveLength(12)
  })

  it('cuts a loop through the cube', () => {
    const next = loopCut(cubeMesh(), 0, 0)
    expect(next).not.toBeNull()
    if (!next) return
    expect(next.faces).toHaveLength(10)
    expect(next.positions).toHaveLength(12)
  })
})
