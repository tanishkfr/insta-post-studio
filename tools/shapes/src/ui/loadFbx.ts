import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { fitTriangles, type TriangleMesh } from '../editor/triangles'

export async function trianglesFromFbx(buffer: ArrayBuffer): Promise<TriangleMesh | null> {
  try {
    const group = new FBXLoader().parse(buffer, '')
    group.updateMatrixWorld(true)
    const positions: number[] = []
    const indices: number[] = []
    const vertex = new THREE.Vector3()
    group.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return
      const source = node.geometry.getAttribute('position')
      if (!(source instanceof THREE.BufferAttribute)) return
      const base = positions.length / 3
      for (let i = 0; i < source.count; i += 1) {
        vertex.fromBufferAttribute(source, i).applyMatrix4(node.matrixWorld)
        positions.push(vertex.x, vertex.y, vertex.z)
      }
      const index = node.geometry.getIndex()
      if (index) {
        for (let i = 0; i < index.count; i += 1) indices.push(base + index.getX(i))
      } else {
        for (let i = 0; i < source.count; i += 1) indices.push(base + i)
      }
    })
    return fitTriangles(positions, indices)
  } catch {
    return null
  }
}
