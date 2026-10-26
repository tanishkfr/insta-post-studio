import { displayTransform, type MeshSource, type ShapeKind, type ProjectedMesh } from '../editor/model'

export function restPose(kind: ShapeKind): { rotateX: number } {
  return { rotateX: kind === 'plane' ? -90 : 0 }
}

export function projectMeshes(state: MeshSource): ProjectedMesh[] {
  return state.document.objects.map((object) => ({
    id: object.id,
    kind: object.kind,
    name: object.name,
    transform: displayTransform(state, object.id),
    selected: state.selection === object.id,
    color: object.color,
    form: object.form,
    deform: object.deform,
    array: object.array,
    stroke: object.stroke,
    remix: object.remix,
    mesh: object.mesh,
    triangles: object.triangles,
    activeFace: state.selection === object.id ? state.activeFace : null,
  }))
}
