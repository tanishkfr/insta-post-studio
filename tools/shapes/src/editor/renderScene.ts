import * as THREE from 'three'
import type { ProjectedMesh, ShapeKind, Snapshot, Transform } from './model'
import { COLOR_SWATCHES } from '../theme'
import { applyDeform } from '../ui/deform'
import { createShapeGeometry, geometryFromQuads, geometryFromTriangles } from '../ui/shapeGeometry'
import { restPose } from '../ui/projectMesh'
import { projectMeshes } from '../ui/projectMesh'

const DEG = Math.PI / 180

export interface TransparentRenderOptions {
  width: number
  height: number
  /** Accepted for parity with the host render contract; output always preserves alpha. */
  background?: 'transparent'
}

export interface TransparentRenderResult {
  bytes: Uint8Array
  width: number
  height: number
  visiblePixels: number
  transparentPixels: number
}

export class ShapesRenderError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable = false) {
    super(message)
    this.name = 'ShapesRenderError'
    this.code = code
    this.retryable = retryable
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function unitNoise(seed: number, index: number, channel: number): number {
  const value = Math.sin(seed * 12.9898 + index * 78.233 + channel * 45.164) * 43758.5453
  return value - Math.floor(value)
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

function jitterFor(array: ProjectedMesh['array'], index: number) {
  if (!array || array.jitter <= 0) {
    return { pos: [0, 0, 0] as const, rot: [0, 0, 0] as const, scale: 1 }
  }
  const span = Math.max(Math.abs(array.gap), 0.2) * array.jitter
  return {
    pos: [1, 2, 3].map((channel) => (unitNoise(array.seed, index, channel) - 0.5) * span) as [
      number,
      number,
      number,
    ],
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

function addLights(scene: THREE.Scene, light: Snapshot['light']): void {
  if (light === 'soft') {
    scene.add(new THREE.AmbientLight(0xffffff, 0.85))
    const key = new THREE.DirectionalLight(0xffffff, 0.35)
    key.position.set(4, 8, 2)
    scene.add(key)
    return
  }
  if (light === 'rim') {
    scene.add(new THREE.AmbientLight(0xffffff, 0.22))
    const back = new THREE.DirectionalLight(0xffffff, 1.4)
    back.position.set(-6, 4, -8)
    scene.add(back)
    const fill = new THREE.DirectionalLight(0xffffff, 0.45)
    fill.position.set(3, 6, 5)
    scene.add(fill)
    return
  }
  scene.add(new THREE.AmbientLight(0xffffff, 0.45))
  const key = new THREE.DirectionalLight(0xffffff, 1.15)
  key.position.set(6, 10, 4)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xffffff, 0.4)
  fill.position.set(-5, 3, -4)
  scene.add(fill)
}

function buildObjectGeometry(item: ProjectedMesh): THREE.BufferGeometry {
  return applyDeform(
    item.triangles
      ? geometryFromTriangles(item.triangles)
      : item.mesh
        ? geometryFromQuads(item.mesh)
        : createShapeGeometry(item.kind as ShapeKind),
    item.deform,
  )
}

function instanceTransform(
  transform: Transform,
  item: ProjectedMesh,
  index: number,
): { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] } {
  const spot = item.stroke && item.stroke.points.length >= 2 ? sampleStroke(item.stroke)[index] : undefined
  const [ox, oy, oz] = spot ? [spot.ox, spot.oy, spot.oz] : instanceOffset(item.array, index)
  const [sx, sy, sz] = spot ? [0, spot.yaw, 0] : instanceSpin(item.array, index)
  const jitter = jitterFor(item.array, index)
  const remix = item.remix === null ? null : remixLook(item.remix, index)
  const remixScale = remix?.scale ?? 1
  return {
    position: [
      transform.position.x + ox + jitter.pos[0],
      transform.position.y + oy + jitter.pos[1],
      transform.position.z + oz + jitter.pos[2],
    ],
    rotation: [
      transform.rotation.x * DEG + sx + jitter.rot[0],
      transform.rotation.y * DEG + sy + jitter.rot[1],
      transform.rotation.z * DEG + sz + jitter.rot[2],
    ],
    scale: [
      transform.scale.x * jitter.scale * remixScale,
      transform.scale.y * jitter.scale * remixScale,
      transform.scale.z * jitter.scale * remixScale,
    ],
  }
}

interface RenderResources {
  scene: THREE.Scene
  geometries: THREE.BufferGeometry[]
  materials: THREE.Material[]
  textures: THREE.Texture[]
}

function buildScene(snapshot: Snapshot): RenderResources {
  const scene = new THREE.Scene()
  // No background: the render target's alpha channel remains transparent.
  scene.background = null
  addLights(scene, snapshot.light)
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const textures: THREE.Texture[] = []
  const toonGradient = gradientMap([0.25, 0.55, 1])
  textures.push(toonGradient)

  const meshes = projectMeshes({
    document: snapshot.document,
    selection: null,
    activeFace: null,
    pointer: { owner: 'idle' },
    draft: null,
  })

  for (const item of meshes) {
    const geometry = buildObjectGeometry(item)
    geometries.push(geometry)
    const rest = restPose(item.kind).rotateX * DEG
    const strokeSpots = item.stroke && item.stroke.points.length >= 2 ? sampleStroke(item.stroke) : null
    const count = strokeSpots?.length ?? item.array?.count ?? 1
    for (let index = 0; index < count; index += 1) {
      const { position, rotation, scale } = instanceTransform(item.transform, item, index)
      const remix = item.remix === null ? null : remixLook(item.remix, index)
      const fill = snapshot.shade === 'ink' ? '#ffffff' : remix?.color ?? item.color
      const group = new THREE.Group()
      group.position.set(...position)
      group.rotation.set(...rotation)
      group.scale.set(...scale)

      // Backface shell and ink edges are part of the intended material look.
      // Selection-only wireframes, the grid, gizmos and draft strokes are never
      // added to this scene.
      if (snapshot.shade !== 'flat') {
        const shellMaterial = new THREE.MeshBasicMaterial({
          color: snapshot.shade === 'ink' ? new THREE.Color(snapshot.inkColor) : new THREE.Color('#1a1a1a'),
          side: THREE.BackSide,
        })
        materials.push(shellMaterial)
        const shell = new THREE.Mesh(geometry, shellMaterial)
        shell.rotation.x = rest
        shell.scale.setScalar(1.045)
        group.add(shell)
      }

      let material: THREE.Material
      if (snapshot.shade === 'toon') {
        material = new THREE.MeshToonMaterial({
          color: new THREE.Color(fill),
          gradientMap: toonGradient,
        })
      } else {
        material = new THREE.MeshBasicMaterial({ color: new THREE.Color(fill) })
      }
      materials.push(material)
      const body = new THREE.Mesh(geometry, material)
      body.rotation.x = rest
      group.add(body)

      if (snapshot.shade === 'ink') {
        const edges = new THREE.EdgesGeometry(geometry)
        geometries.push(edges)
        const edgeMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(snapshot.inkColor) })
        materials.push(edgeMaterial)
        const lines = new THREE.LineSegments(edges, edgeMaterial)
        lines.rotation.x = rest
        group.add(lines)
      }
      scene.add(group)
    }
  }
  return { scene, geometries, materials, textures }
}

function disposeResources(resources: RenderResources): void {
  for (const geometry of resources.geometries) geometry.dispose()
  for (const material of resources.materials) material.dispose()
  for (const texture of resources.textures) texture.dispose()
  resources.scene.clear()
}

function cameraFor(snapshot: Snapshot, aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 200)
  const { theta, phi, radius, target } = snapshot.camera
  const sinPhi = Math.sin(phi)
  camera.position.set(
    target.x + radius * sinPhi * Math.cos(theta),
    target.y + radius * Math.cos(phi),
    target.z + radius * sinPhi * Math.sin(theta),
  )
  camera.up.set(0, 1, 0)
  camera.lookAt(target.x, target.y, target.z)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return camera
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new ShapesRenderError('RENDER_FAILED', 'The transparent PNG could not be encoded.', true))
    }, 'image/png')
  })
}

function bytesFromBlob(blob: Blob): Promise<Uint8Array> {
  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer))
}

/**
 * Renders the real 3D scene into an offscreen RGBA render target and encodes a
 * transparent PNG. The interactive R3F canvas is never read. The grid, gizmos,
 * selection boxes, active-face highlights and draft strokes are excluded by
 * construction because only object geometry/materials are added to this scene.
 */
export async function renderTransparentPng(
  snapshot: Snapshot,
  options: TransparentRenderOptions,
): Promise<TransparentRenderResult> {
  const width = Math.round(options.width)
  const height = Math.round(options.height)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16) {
    throw new ShapesRenderError('RENDER_FAILED', 'The requested Shapes render size is invalid.')
  }
  if (width > 4096 || height > 4096) {
    throw new ShapesRenderError('ENVIRONMENT_UNSUPPORTED', 'The requested Shapes render exceeds the WebGL size limit.')
  }
  if (typeof document === 'undefined') {
    throw new ShapesRenderError('ENVIRONMENT_UNSUPPORTED', 'Shapes PNG rendering requires a browser document.')
  }

  const resources = buildScene(snapshot)
  let renderer: THREE.WebGLRenderer | null = null
  let target: THREE.WebGLRenderTarget | null = null
  let contextLost = false
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(1)
    renderer.setSize(width, height, false)
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    const gl = renderer.getContext()
    if (!gl || gl.isContextLost()) {
      throw new ShapesRenderError('ENVIRONMENT_UNSUPPORTED', 'WebGL is unavailable, so Shapes cannot render a PNG.', true)
    }
    const onLost = (event: Event) => {
      event.preventDefault()
      contextLost = true
    }
    renderer.domElement.addEventListener('webglcontextlost', onLost)

    // 2x supersampling is used instead of a multisampled framebuffer because
    // readPixels from a resolved render target is not portable. The final
    // canvas is downsampled to the exact requested host dimensions.
    const maxPixels = 8_500_000
    const supersample = width * height * 4 <= maxPixels ? 2 : 1
    const renderWidth = width * supersample
    const renderHeight = height * supersample
    target = new THREE.WebGLRenderTarget(renderWidth, renderHeight, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    })
    target.texture.colorSpace = THREE.SRGBColorSpace
    target.texture.generateMipmaps = false

    const camera = cameraFor(snapshot, width / height)
    renderer.setRenderTarget(target)
    renderer.clear()
    renderer.render(resources.scene, camera)
    if (contextLost || renderer.getContext().isContextLost()) {
      throw new ShapesRenderError('ENVIRONMENT_UNSUPPORTED', 'The WebGL context was lost while rendering Shapes.', true)
    }
    const pixels = new Uint8Array(renderWidth * renderHeight * 4)
    renderer.readRenderTargetPixels(target, 0, 0, renderWidth, renderHeight, pixels)

    let visiblePixels = 0
    let transparentPixels = 0
    const flipped = new Uint8ClampedArray(pixels.length)
    for (let y = 0; y < renderHeight; y += 1) {
      const sourceRow = (renderHeight - 1 - y) * renderWidth * 4
      const targetRow = y * renderWidth * 4
      for (let x = 0; x < renderWidth * 4; x += 4) {
        const source = sourceRow + x
        const dest = targetRow + x
        const alpha = pixels[source + 3] ?? 0
        if (alpha > 0) {
          visiblePixels += 1
          // WebGL's default compositing stores premultiplied RGB in the target.
          // PNG readers expect straight alpha, so undo the premultiplication.
          if (alpha < 255) {
            flipped[dest] = Math.min(255, Math.round(((pixels[source] ?? 0) * 255) / alpha))
            flipped[dest + 1] = Math.min(255, Math.round(((pixels[source + 1] ?? 0) * 255) / alpha))
            flipped[dest + 2] = Math.min(255, Math.round(((pixels[source + 2] ?? 0) * 255) / alpha))
          } else {
            flipped[dest] = pixels[source] ?? 0
            flipped[dest + 1] = pixels[source + 1] ?? 0
            flipped[dest + 2] = pixels[source + 2] ?? 0
          }
          flipped[dest + 3] = alpha
        } else {
          transparentPixels += 1
          flipped[dest] = 0
          flipped[dest + 1] = 0
          flipped[dest + 2] = 0
          flipped[dest + 3] = 0
        }
      }
    }
    if (visiblePixels === 0) {
      throw new ShapesRenderError(
        'RENDER_FAILED',
        'Shapes has no visible objects at this camera framing. Add or frame a shape before publishing.',
        true,
      )
    }

    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = renderWidth
    sourceCanvas.height = renderHeight
    const sourceContext = sourceCanvas.getContext('2d')
    if (!sourceContext) {
      throw new ShapesRenderError('RENDER_FAILED', 'The 2D canvas used to encode Shapes is unavailable.', true)
    }
    sourceContext.putImageData(new ImageData(flipped, renderWidth, renderHeight), 0, 0)

    const output = document.createElement('canvas')
    output.width = width
    output.height = height
    const outputContext = output.getContext('2d')
    if (!outputContext) {
      throw new ShapesRenderError('RENDER_FAILED', 'The 2D canvas used to encode Shapes is unavailable.', true)
    }
    outputContext.imageSmoothingEnabled = true
    outputContext.imageSmoothingQuality = 'high'
    outputContext.clearRect(0, 0, width, height)
    outputContext.drawImage(sourceCanvas, 0, 0, width, height)

    // Re-read the final output rather than trusting the pre-downsample count:
    // this verifies the actual published PNG has both object and empty pixels.
    const outputPixels = outputContext.getImageData(0, 0, width, height).data
    let finalVisible = 0
    let finalTransparent = 0
    for (let index = 3; index < outputPixels.length; index += 4) {
      if ((outputPixels[index] ?? 0) > 0) finalVisible += 1
      else finalTransparent += 1
    }
    if (finalVisible === 0 || finalTransparent === 0) {
      throw new ShapesRenderError(
        'RENDER_FAILED',
        'Shapes produced an invalid transparent frame (no object pixels or no transparent regions).',
        true,
      )
    }

    const blob = await canvasToBlob(output)
    const bytes = await bytesFromBlob(blob)
    if (bytes.byteLength < 100) {
      throw new ShapesRenderError('RENDER_FAILED', 'Shapes produced an empty PNG.', true)
    }
    renderer.domElement.removeEventListener('webglcontextlost', onLost)
    return { bytes, width, height, visiblePixels: finalVisible, transparentPixels: finalTransparent }
  } finally {
    target?.dispose()
    if (renderer) {
      renderer.dispose()
      renderer.domElement.width = 1
      renderer.domElement.height = 1
    }
    disposeResources(resources)
  }
}

export function cameraDistanceSummary(camera: Snapshot['camera']): string {
  return `${clamp(camera.radius, 2.2, 48).toFixed(1)}u`
}
