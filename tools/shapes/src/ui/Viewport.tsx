import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  gizmoFrame,
  type Axis,
  type Hit,
  type ObjectId,
  type PointerButton,
  type ProjectedMesh,
  type Snapshot,
  type Transform,
} from '../editor/model'
import type { Editor } from '../editor/store'
import { COLOR_SWATCHES, tokens } from '../theme'
import { projectMeshes, restPose } from './projectMesh'
import { createShapeGeometry, geometryFromQuads, geometryFromTriangles } from './shapeGeometry'
import { applyDeform } from './deform'

const DEG = Math.PI / 180
const AXIS_TINT: Record<Axis, string> = {
  x: tokens.gizmoX,
  y: tokens.gizmoY,
  z: tokens.gizmoZ,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function pointerButton(button: number): PointerButton {
  if (button === 0) return 'left'
  if (button === 1) return 'middle'
  if (button === 2) return 'right'
  return 'none'
}

function hitFromIntersects(intersects: THREE.Intersection[]): Hit {
  for (const item of intersects) {
    const data = item.object.userData
    if (data.hit === 'gizmo') {
      return { target: 'gizmo', id: data.id as ObjectId, axis: data.axis as Axis }
    }
  }
  for (const item of intersects) {
    const data = item.object.userData
    if (data.hit === 'mesh') {
      const triangle = item.faceIndex ?? 0
      return { target: 'mesh', id: data.id as ObjectId, face: Math.floor(triangle / 2) }
    }
  }
  return { target: 'empty' }
}

function instanceOffset(array: ProjectedMesh['array'], index: number): [number, number, number] {
  if (!array) return [0, 0, 0]
  if (array.layout === 'scatter') {
    if (index === 0) return [0, 0, 0]
    const angle = unitNoise(array.seed, index, 11) * Math.PI * 2
    const dist = Math.sqrt(unitNoise(array.seed, index, 12)) * Math.abs(array.gap)
    return [Math.cos(angle) * dist, 0, Math.sin(angle) * dist]
  }
  if (array.layout === 'radial') {
    const angle = (Math.PI * 2 * index) / array.count
    const c = Math.cos(angle) * array.gap
    const s = Math.sin(angle) * array.gap
    if (array.axis === 'x') return [0, c, s]
    if (array.axis === 'z') return [c, s, 0]
    return [c, 0, s]
  }
  if (index === 0) return [0, 0, 0]
  if (array.axis === 'y') return [0, array.gap * index, 0]
  if (array.axis === 'z') return [0, 0, array.gap * index]
  return [array.gap * index, 0, 0]
}

function unitNoise(seed: number, index: number, channel: number): number {
  const value = Math.sin(seed * 12.9898 + index * 78.233 + channel * 45.164) * 43758.5453
  return value - Math.floor(value)
}

function jitterFor(array: ProjectedMesh['array'], index: number) {
  if (!array || array.jitter <= 0) {
    return { pos: [0, 0, 0] as const, rot: [0, 0, 0] as const, scale: 1 }
  }
  const span = Math.max(Math.abs(array.gap), 0.2) * array.jitter
  return {
    pos: [1, 2, 3].map((channel) => (unitNoise(array.seed, index, channel) - 0.5) * span) as [number, number, number],
    rot: [4, 5, 6].map((channel) => (unitNoise(array.seed, index, channel) - 0.5) * array.jitter * 0.9) as [
      number,
      number,
      number,
    ],
    scale: 1 + (unitNoise(array.seed, index, 7) - 0.5) * array.jitter * 0.5,
  }
}

function remixLook(seed: number, index: number): { color: string; scale: number } {
  const color = COLOR_SWATCHES[Math.floor(unitNoise(seed, index, 8) * COLOR_SWATCHES.length)] ?? COLOR_SWATCHES[0]
  return { color, scale: 0.75 + unitNoise(seed, index, 9) * 0.7 }
}

function sampleStroke(stroke: NonNullable<ProjectedMesh['stroke']>): { ox: number; oy: number; oz: number; yaw: number }[] {
  const spacing = Math.max(0.15, stroke.spacing)
  const samples: { ox: number; oy: number; oz: number; yaw: number }[] = []
  const first = stroke.points[0]
  if (!first) return samples
  samples.push({ ox: first.x, oy: 0, oz: first.z, yaw: 0 })
  let carry = 0
  let prev = first
  for (let i = 1; i < stroke.points.length; i += 1) {
    const next = stroke.points[i]
    if (!next) continue
    const dx = next.x - prev.x
    const dz = next.z - prev.z
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) {
      prev = next
      continue
    }
    const yaw = Math.atan2(dx, dz)
    let dist = spacing - carry
    while (dist <= len + 1e-6 && samples.length < 40) {
      const t = dist / len
      samples.push({ ox: prev.x + dx * t, oy: 0, oz: prev.z + dz * t, yaw })
      dist += spacing
    }
    carry = len - (dist - spacing)
    prev = next
  }
  const start = samples[0]
  const second = samples[1]
  if (start && second) samples[0] = { ox: start.ox, oy: start.oy, oz: start.oz, yaw: second.yaw }
  return samples
}

function instanceSpin(array: ProjectedMesh['array'], index: number): [number, number, number] {
  if (!array) return [0, 0, 0]
  if (array.layout === 'scatter') {
    if (index === 0) return [0, 0, 0]
    return [0, (unitNoise(array.seed, index, 13) - 0.5) * Math.PI * 2, 0]
  }
  if (array.layout !== 'radial') return [0, 0, 0]
  const angle = (Math.PI * 2 * index) / array.count
  if (array.axis === 'x') return [angle, 0, 0]
  if (array.axis === 'z') return [0, 0, angle]
  return [0, angle, 0]
}

function ShapeMesh({
  item,
  shade,
  wireframe,
  inkColor,
}: {
  item: ProjectedMesh
  shade: Snapshot['shade']
  wireframe: boolean
  inkColor: string
}) {
  const rest = restPose(item.kind).rotateX * DEG
  const geometry = useMemo(
    () =>
      applyDeform(
        item.triangles ? geometryFromTriangles(item.triangles) : item.mesh ? geometryFromQuads(item.mesh) : createShapeGeometry(item.kind),
        item.deform,
      ),
    [item.kind, item.deform, item.mesh, item.triangles],
  )
  const faceGeometry = useMemo(() => {
    if (!item.mesh || item.activeFace === null) return null
    const face = item.mesh.faces[item.activeFace]
    if (!face) return null
    return geometryFromQuads({ positions: item.mesh.positions, faces: [face] })
  }, [item.mesh, item.activeFace])
  useEffect(() => () => faceGeometry?.dispose(), [faceGeometry])
  const edges = useMemo(() => {
    const base = new THREE.EdgesGeometry(geometry)
    if (shade !== 'ink') return base
    const pos = base.getAttribute('position')
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const amount = 0.016
      pos.setXYZ(
        i,
        x + Math.sin(y * 46 + z * 19) * amount,
        y + Math.sin(x * 38 + z * 23) * amount,
        z + Math.sin(x * 29 + y * 41) * amount,
      )
    }
    return base
  }, [geometry, shade])

  useEffect(() => {
    return () => {
      geometry.dispose()
      edges.dispose()
    }
  }, [geometry, edges])

  const { position, rotation, scale } = item.transform
  const strokeSpots = item.stroke && item.stroke.points.length >= 2 ? sampleStroke(item.stroke) : null
  const count = strokeSpots?.length ?? item.array?.count ?? 1
  const strokeLine = useMemo(() => {
    const points = item.stroke?.points
    if (!points || points.length < 2) return null
    const flat = new Float32Array((points.length - 1) * 6)
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index]
      const b = points[index + 1]
      if (!a || !b) continue
      flat[index * 6] = position.x + a.x
      flat[index * 6 + 1] = 0.02
      flat[index * 6 + 2] = position.z + a.z
      flat[index * 6 + 3] = position.x + b.x
      flat[index * 6 + 4] = 0.02
      flat[index * 6 + 5] = position.z + b.z
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(flat, 3))
    return geometry
  }, [item.stroke, position.x, position.z])
  useEffect(() => () => strokeLine?.dispose(), [strokeLine])
  return (
    <>
      {strokeLine ? (
        <lineSegments geometry={strokeLine}>
          <lineBasicMaterial color={tokens.accent} />
        </lineSegments>
      ) : null}
      {Array.from({ length: count }, (_, index) => {
        const spot = strokeSpots?.[index]
        const [ox, oy, oz] = spot ? [spot.ox, spot.oy, spot.oz] : instanceOffset(item.array, index)
        const [sx, sy, sz] = spot ? [0, spot.yaw, 0] : instanceSpin(item.array, index)
        const jitter = jitterFor(item.array, index)
        const remix = item.remix === null ? null : remixLook(item.remix, index)
        const fill = shade === 'ink' ? '#ffffff' : remix?.color ?? item.color
        const remixScale = remix?.scale ?? 1
        return (
          <group
            key={index}
            position={[position.x + ox + jitter.pos[0], position.y + oy + jitter.pos[1], position.z + oz + jitter.pos[2]]}
            rotation={[rotation.x * DEG + sx + jitter.rot[0], rotation.y * DEG + sy + jitter.rot[1], rotation.z * DEG + sz + jitter.rot[2]]}
            scale={[scale.x * jitter.scale * remixScale, scale.y * jitter.scale * remixScale, scale.z * jitter.scale * remixScale]}
          >
            {shade !== 'flat' ? (
              <mesh geometry={geometry} rotation={[rest, 0, 0]} scale={1.045}>
                <meshBasicMaterial color={shade === 'ink' ? inkColor : '#1a1a1a'} side={THREE.BackSide} />
              </mesh>
            ) : null}
            <mesh geometry={geometry} rotation={[rest, 0, 0]} userData={{ hit: 'mesh', id: item.id }}>
              <ShadeMaterial color={fill} shade={shade} transparent={false} opacity={1} />
            </mesh>
            {faceGeometry && item.selected ? (
              <mesh geometry={faceGeometry} rotation={[rest, 0, 0]} renderOrder={2}>
                <meshBasicMaterial color={tokens.onStageAccent} transparent opacity={0.45} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
            ) : null}
            {shade === 'ink' || (wireframe && item.selected) ? (
              <lineSegments geometry={edges} rotation={[rest, 0, 0]} renderOrder={1}>
                <lineBasicMaterial color={shade === 'ink' ? inkColor : tokens.onStageAccent} />
              </lineSegments>
            ) : null}
          </group>
        )
      })}
    </>
  )
}

function axisRotation(axis: Axis): [number, number, number] {
  if (axis === 'x') return [0, 0, -Math.PI / 2]
  if (axis === 'z') return [Math.PI / 2, 0, 0]
  return [0, 0, 0]
}

function ringRotation(axis: Axis): [number, number, number] {
  if (axis === 'x') return [0, Math.PI / 2, 0]
  if (axis === 'y') return [Math.PI / 2, 0, 0]
  return [0, 0, 0]
}

function MoveArm({ axis, id, active }: { axis: Axis; id: ObjectId; active: boolean }) {
  const color = active ? tokens.onStageAccent : AXIS_TINT[axis]
  return (
    <group rotation={axisRotation(axis)}>
      <mesh position={[0, 0.48, 0]} renderOrder={10} userData={{ hit: 'gizmo', id, axis }}>
        <cylinderGeometry args={[0.012, 0.012, 0.9, 16]} />
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.98, 0]} renderOrder={10} userData={{ hit: 'gizmo', id, axis }}>
        <coneGeometry args={[0.048, 0.14, 20]} />
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function RotateRing({ axis, id, active }: { axis: Axis; id: ObjectId; active: boolean }) {
  const color = active ? tokens.onStageAccent : AXIS_TINT[axis]
  return (
    <mesh rotation={ringRotation(axis)} renderOrder={10} userData={{ hit: 'gizmo', id, axis }}>
      <torusGeometry args={[0.92, 0.011, 8, 80]} />
      <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
    </mesh>
  )
}

function ScaleHandle({ axis, id, active }: { axis: Axis; id: ObjectId; active: boolean }) {
  const color = active ? tokens.onStageAccent : AXIS_TINT[axis]
  return (
    <group rotation={axisRotation(axis)}>
      <mesh position={[0, 0.4, 0]} renderOrder={10} userData={{ hit: 'gizmo', id, axis }}>
        <cylinderGeometry args={[0.01, 0.01, 0.76, 12]} />
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.86, 0]} renderOrder={10} userData={{ hit: 'gizmo', id, axis }}>
        <boxGeometry args={[0.09, 0.09, 0.09]} />
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function AxisGizmo({
  id,
  transform,
  tool,
  activeAxis,
}: {
  id: ObjectId
  transform: Transform
  tool: Snapshot['tool']
  activeAxis: Axis | null
}) {
  const local = gizmoFrame(transform.rotation) === 'local'
  const Handle = tool === 'rotate' ? RotateRing : tool === 'scale' ? ScaleHandle : MoveArm
  return (
    <group
      position={[transform.position.x, transform.position.y, transform.position.z]}
      rotation={
        local
          ? [transform.rotation.x * DEG, transform.rotation.y * DEG, transform.rotation.z * DEG]
          : [0, 0, 0]
      }
    >
      <mesh renderOrder={9}>
        <sphereGeometry args={[0.028, 16, 12]} />
        <meshBasicMaterial color="#f7f4ef" depthTest={false} toneMapped={false} />
      </mesh>
      <Handle axis="x" id={id} active={activeAxis === 'x'} />
      <Handle axis="y" id={id} active={activeAxis === 'y'} />
      <Handle axis="z" id={id} active={activeAxis === 'z'} />
    </group>
  )
}

function DraftStroke({ points, origin }: { points: { x: number; z: number }[]; origin: { x: number; z: number } }) {
  const geometry = useMemo(() => {
    const flat = new Float32Array((points.length - 1) * 6)
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index]
      const b = points[index + 1]
      if (!a || !b) continue
      flat[index * 6] = origin.x + a.x
      flat[index * 6 + 1] = 0.04
      flat[index * 6 + 2] = origin.z + a.z
      flat[index * 6 + 3] = origin.x + b.x
      flat[index * 6 + 4] = 0.04
      flat[index * 6 + 5] = origin.z + b.z
    }
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(flat, 3))
    return next
  }, [origin.x, origin.z, points])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={tokens.accent} />
    </lineSegments>
  )
}

function SelectionBox({ item }: { item: ProjectedMesh }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), [])
  useEffect(() => () => edges.dispose(), [edges])
  const { position, rotation, scale } = item.transform
  const pad = 1.08
  return (
    <lineSegments
      geometry={edges}
      position={[position.x, position.y, position.z]}
      rotation={[rotation.x * DEG, rotation.y * DEG, rotation.z * DEG]}
      scale={[Math.abs(scale.x) * pad, Math.abs(scale.y) * pad, Math.abs(scale.z) * pad]}
    >
      <lineBasicMaterial color="#3B82F6" />
    </lineSegments>
  )
}

function SceneInput({ editor }: { editor: Editor }) {
  const { camera, gl, scene } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])
  const panRight = useMemo(() => new THREE.Vector3(), [])
  const panUp = useMemo(() => new THREE.Vector3(), [])
  const strokePoints = useRef<{ x: number; z: number }[] | null>(null)
  const ground = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const groundHit = useMemo(() => new THREE.Vector3(), [])
  const rig = useRef({
    theta: 0.72,
    phi: 1.08,
    radius: 9,
    target: new THREE.Vector3(0.4, 0.2, 0.4),
    lastX: 0,
    lastY: 0,
  })

  useFrame(() => {
    const { theta, phi, radius, target } = rig.current
    const sinPhi = Math.sin(phi)
    camera.position.set(
      target.x + radius * sinPhi * Math.cos(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * sinPhi * Math.sin(theta),
    )
    camera.up.set(0, 1, 0)
    camera.lookAt(target)
  })

  useEffect(() => {
    const el = gl.domElement
    el.style.touchAction = 'none'
    const parent = el.parentElement
    const fit = () => {
      if (!parent) return
      const width = parent.clientWidth
      const height = parent.clientHeight
      if (width > 0 && height > 0) gl.setSize(width, height, true)
    }
    fit()
    const observer = new ResizeObserver(fit)
    if (parent) observer.observe(parent)

    const pick = (clientX: number, clientY: number): Hit => {
      const rect = el.getBoundingClientRect()
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      return hitFromIntersects(raycaster.intersectObjects(scene.children, true))
    }

    const groundPoint = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect()
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      return raycaster.ray.intersectPlane(ground, groundHit) ? groundHit.clone() : null
    }

    const onDown = (event: PointerEvent) => {
      event.preventDefault()
      rig.current.lastX = event.clientX
      rig.current.lastY = event.clientY
      const snap = editor.snapshot()
      if (snap.drawingStroke && event.button === 0 && snap.selection) {
        const hit = groundPoint(event.clientX, event.clientY)
        const selected = snap.document.objects.find((object) => object.id === snap.selection)
        if (hit && selected) {
          strokePoints.current = [
            { x: hit.x - selected.transform.position.x, z: hit.z - selected.transform.position.z },
          ]
          editor.dispatch({ kind: 'strokeDraft', points: strokePoints.current })
          if (el.hasPointerCapture(event.pointerId) === false) el.setPointerCapture(event.pointerId)
          return
        }
      }
      editor.dispatch({
        kind: 'pointerDown',
        hit: pick(event.clientX, event.clientY),
        screen: { x: event.clientX, y: event.clientY },
        button: pointerButton(event.button),
      })
      if (el.hasPointerCapture(event.pointerId) === false) {
        el.setPointerCapture(event.pointerId)
      }
    }

    const onMove = (event: PointerEvent) => {
      if (strokePoints.current) {
        const snap = editor.snapshot()
        const selected = snap.document.objects.find((object) => object.id === snap.selection)
        const hit = groundPoint(event.clientX, event.clientY)
        const last = strokePoints.current[strokePoints.current.length - 1]
        if (hit && selected && last) {
          const point = { x: hit.x - selected.transform.position.x, z: hit.z - selected.transform.position.z }
          if (Math.hypot(point.x - last.x, point.z - last.z) > 0.12) {
            strokePoints.current = [...strokePoints.current, point]
            editor.dispatch({ kind: 'strokeDraft', points: strokePoints.current })
          }
        }
        return
      }
      editor.dispatch({ kind: 'pointerMove', screen: { x: event.clientX, y: event.clientY } })
      const lock = editor.snapshot().pointer
      const dx = event.clientX - rig.current.lastX
      const dy = event.clientY - rig.current.lastY
      rig.current.lastX = event.clientX
      rig.current.lastY = event.clientY
      if (lock.owner !== 'camera') return
      if (lock.gesture === 'orbit') {
        rig.current.theta -= dx * 0.005
        rig.current.phi = clamp(rig.current.phi - dy * 0.005, 0.12, Math.PI - 0.12)
        return
      }
      if (lock.gesture === 'pan') {
        const pan = rig.current.radius * 0.0018
        panRight.setFromMatrixColumn(camera.matrixWorld, 0)
        panUp.setFromMatrixColumn(camera.matrixWorld, 1)
        rig.current.target.addScaledVector(panRight, -dx * pan)
        rig.current.target.addScaledVector(panUp, dy * pan)
      }
    }

    const onUp = (event: PointerEvent) => {
      if (strokePoints.current) {
        const points = strokePoints.current
        strokePoints.current = null
        const snap = editor.snapshot()
        const selected = snap.document.objects.find((object) => object.id === snap.selection)
        if (points.length >= 2) {
          editor.dispatch({
            kind: 'setStroke',
            stroke: { points, spacing: selected?.stroke?.spacing ?? 0.8 },
          })
        }
        editor.dispatch({ kind: 'strokeDraft', points: null })
        if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId)
        return
      }
      editor.dispatch({ kind: 'pointerUp' })
      if (el.hasPointerCapture(event.pointerId)) {
        el.releasePointerCapture(event.pointerId)
      }
    }

    const onWheel = (event: WheelEvent) => {
      if (editor.snapshot().pointer.owner === 'gizmo') return
      event.preventDefault()
      rig.current.radius = clamp(rig.current.radius * Math.exp(event.deltaY * 0.0012), 2.2, 48)
    }

    const onContext = (event: Event) => event.preventDefault()

    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', onContext)
    return () => {
      observer.disconnect()
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('contextmenu', onContext)
    }
  }, [camera, editor, gl, ground, groundHit, ndc, panRight, panUp, raycaster, scene])

  return null
}

function gradientMap(stops: number[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = stops.length
  canvas.height = 1
  const context = canvas.getContext('2d')
  stops.forEach((stop, index) => {
    const value = Math.round(stop * 255)
    if (!context) return
    context.fillStyle = `rgb(${value},${value},${value})`
    context.fillRect(index, 0, 1, 1)
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  return texture
}

function ShadeMaterial({
  color,
  shade,
  transparent,
  opacity,
}: {
  color: string
  shade: Snapshot['shade']
  transparent: boolean
  opacity: number
}) {
  const toon = useMemo(() => gradientMap([0.25, 0.55, 1]), [])
  if (shade === 'flat' || shade === 'ink') {
    return <meshBasicMaterial color={color} transparent={transparent} opacity={opacity} />
  }
  return (
    <meshToonMaterial color={color} gradientMap={toon} transparent={transparent} opacity={opacity} />
  )
}

function SceneLights({ light }: { light: Snapshot['light'] }) {
  if (light === 'soft') {
    return (
      <>
        <ambientLight intensity={0.85} />
        <directionalLight position={[4, 8, 2]} intensity={0.35} />
      </>
    )
  }
  if (light === 'rim') {
    return (
      <>
        <ambientLight intensity={0.22} />
        <directionalLight position={[-6, 4, -8]} intensity={1.4} />
        <directionalLight position={[3, 6, 5]} intensity={0.45} />
      </>
    )
  }
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 10, 4]} intensity={1.15} />
      <directionalLight position={[-5, 3, -4]} intensity={0.4} />
    </>
  )
}

function Scene({ editor, snapshot }: { editor: Editor; snapshot: Snapshot }) {
  const meshes = projectMeshes(snapshot)
  const selected = meshes.find((item) => item.selected)
  const activeAxis = snapshot.pointer.owner === 'gizmo' ? snapshot.pointer.axis : null

  return (
    <>
      <color attach="background" args={[tokens.mediaStage]} />
      <SceneLights light={snapshot.light} />
      <gridHelper args={[40, 40, '#C5CAD3', '#E2E5EB']} />
      {meshes.map((item) => (
        <ShapeMesh
          key={item.id}
          item={item}
          shade={snapshot.shade}
          wireframe={snapshot.wireframe}
          inkColor={snapshot.inkColor}
        />
      ))}
      {snapshot.strokeDraft && snapshot.strokeDraft.length >= 2 && selected ? (
        <DraftStroke points={snapshot.strokeDraft} origin={selected.transform.position} />
      ) : null}
      {selected && snapshot.wireframe ? <SelectionBox item={selected} /> : null}
      {selected && snapshot.showGizmo ? (
        <AxisGizmo id={selected.id} transform={selected.transform} tool={snapshot.tool} activeAxis={activeAxis} />
      ) : null}
      <SceneInput editor={editor} />
    </>
  )
}

export function Viewport({ editor, snapshot }: { editor: Editor; snapshot: Snapshot }) {
  return (
    <div className="stage" role="region" aria-label="3D viewport">
      <Canvas
        camera={{ fov: 45, near: 0.1, far: 200, position: [6.5, 5, 6.5] }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
        onContextMenu={(event) => event.preventDefault()}
      >
        <Scene editor={editor} snapshot={snapshot} />
      </Canvas>
    </div>
  )
}
