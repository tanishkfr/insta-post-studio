import { Brush, Evaluator, ADDITION, SUBTRACTION } from 'three-bvh-csg'
import * as THREE from 'three'
import type { ProjectedMesh } from '../editor/model'
import { createShapeGeometry, geometryFromQuads, geometryFromTriangles } from './shapeGeometry'
import { applyDeform } from './deform'

const DEG = Math.PI / 180

function brushFrom(item: ProjectedMesh): Brush {
  const source = item.triangles
    ? geometryFromTriangles(item.triangles)
    : item.mesh
      ? geometryFromQuads(item.mesh)
      : createShapeGeometry(item.kind, true)
  const brush = new Brush(applyDeform(source, item.deform))
  const { position, rotation, scale } = item.transform
  brush.position.set(position.x, position.y, position.z)
  brush.rotation.set(rotation.x * DEG, rotation.y * DEG, rotation.z * DEG)
  brush.scale.set(scale.x, scale.y, scale.z)
  brush.updateMatrixWorld()
  return brush
}

export function cutSolid(meshes: readonly ProjectedMesh[]): THREE.BufferGeometry | null {
  const positives = meshes.filter((item) => item.form === 'positive')
  const negatives = meshes.filter((item) => item.form === 'negative')
  const first = positives[0]
  if (!first || negatives.length === 0) return null
  const evaluator = new Evaluator()
  evaluator.useGroups = false
  let solid = brushFrom(first)
  for (const item of positives.slice(1)) {
    solid = evaluator.evaluate(solid, brushFrom(item), ADDITION)
  }
  for (const item of negatives) {
    solid = evaluator.evaluate(solid, brushFrom(item), SUBTRACTION)
  }
  return solid.geometry
}
