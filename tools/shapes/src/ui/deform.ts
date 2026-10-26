import * as THREE from 'three'
import type { Deform } from '../editor/model'

export function applyDeform(geometry: THREE.BufferGeometry, deform: Deform): THREE.BufferGeometry {
  if (deform.twist === 0 && deform.taper === 0 && deform.noise === 0) return geometry
  const next = geometry.clone()
  const position = next.attributes.position
  if (!position) return next
  const twist = (deform.twist * Math.PI) / 180
  for (let index = 0; index < position.count; index += 1) {
    let x = position.getX(index)
    let y = position.getY(index)
    const z = position.getZ(index)
    const angle = twist * y
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const twistedX = x * cos - z * sin
    const twistedZ = x * sin + z * cos
    const taper = 1 + deform.taper * y
    x = twistedX * taper
    const zz = twistedZ * taper
    const n = Math.sin(x * 9.1 + y * 6.3) * Math.cos(z * 8.2) * deform.noise
    position.setXYZ(index, x + n, y, zz + n * 0.35)
  }
  position.needsUpdate = true
  next.computeVertexNormals()
  return next
}
