import * as THREE from 'three'
import type { QuadMesh, ShapeKind } from '../editor/model'
import type { TriangleMesh } from '../editor/triangles'
import { restPose } from './projectMesh'

export function geometryFromQuads(mesh: QuadMesh): THREE.BufferGeometry {
  const positions = new Float32Array(mesh.faces.length * 6 * 3)
  let offset = 0
  const write = (index: number) => {
    const point = mesh.positions[index]
    if (!point) return
    positions[offset] = point.x
    positions[offset + 1] = point.y
    positions[offset + 2] = point.z
    offset += 3
  }
  for (const face of mesh.faces) {
    write(face[0])
    write(face[1])
    write(face[2])
    write(face[0])
    write(face[2])
    write(face[3])
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function geometryFromTriangles(mesh: TriangleMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3))
  geometry.setIndex([...mesh.indices])
  geometry.computeVertexNormals()
  return geometry
}

export function createShapeGeometry(kind: ShapeKind, forSolid = false): THREE.BufferGeometry {
  if (kind === 'fbx') return new THREE.BoxGeometry(1, 1, 1)
  if (kind === 'box') return new THREE.BoxGeometry(1, 1, 1)
  if (kind === 'sphere') return new THREE.SphereGeometry(0.5, 32, 24)
  if (kind === 'cone') return new THREE.ConeGeometry(0.5, 1, 28)
  if (kind === 'cylinder') return new THREE.CylinderGeometry(0.5, 0.5, 1, 28)
  if (kind === 'torus') return new THREE.TorusGeometry(0.35, 0.16, 16, 32)
  if (kind === 'capsule') return new THREE.CapsuleGeometry(0.28, 0.55, 8, 16)
  if (forSolid) {
    const slab = new THREE.BoxGeometry(1, 1, 0.08)
    slab.rotateX((restPose('plane').rotateX * Math.PI) / 180)
    return slab
  }
  return new THREE.PlaneGeometry(1, 1)
}
