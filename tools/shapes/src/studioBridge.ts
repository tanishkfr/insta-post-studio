/* Studio Shapes bridge.
 *
 * Shapes runs React 18 / R3F 8 inside its own bundle and document. This bridge
 * is the only integration point used by Studio: it implements the scoped
 * ToolAdapterV1 messaging transport, versioned source serialization and the
 * transparent offscreen render. The preserved editor interface is untouched.
 */
import { renderTransparentPng, ShapesRenderError } from './editor/renderScene'
import { SHAPES_SOURCE_MIME, SHAPES_SOURCE_VERSION } from './editor/sourceState'
import type { Editor } from './editor/store'

const PROTOCOL_VERSION = '1.0.0'
const TOOL_ID = 'shapes'

interface BootScope {
  projectId: string
  sessionId: string
  toolId: string
  channelId: string
}

interface BootConfig {
  protocolVersion: string
  scope: BootScope
  origins: {
    hostOrigin: string
    toolOrigin: string
    requireOriginMatch: boolean
    allowNullOrigin: boolean
  }
  hostOrigin?: string
  toolOrigin?: string
}

interface StudioRequest {
  protocolVersion: string
  kind: 'request'
  scope: BootScope
  requestId: string
  method: string
  params?: Record<string, unknown>
}

function parseBootConfig(): BootConfig | null {
  const prefix = '#studio='
  if (!window.location.hash.startsWith(prefix)) return null
  try {
    return JSON.parse(decodeURIComponent(window.location.hash.slice(prefix.length))) as BootConfig
  } catch {
    return null
  }
}

function structuredError(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof ShapesRenderError) {
    return { code: error.code, message: error.message, retryable: error.retryable }
  }
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown; retryable?: unknown }
    if (typeof candidate.code === 'string' && typeof candidate.message === 'string') {
      return {
        code: candidate.code,
        message: candidate.message,
        retryable: candidate.retryable === true,
      }
    }
  }
  return {
    code: 'ADAPTER_ERROR',
    message: error instanceof Error ? error.message : 'The Shapes editor could not complete that operation.',
    retryable: false,
  }
}

function adapterError(code: string, message: string, retryable = false): Error & { code: string; retryable: boolean } {
  const error = new Error(message) as Error & { code: string; retryable: boolean }
  error.code = code
  error.retryable = retryable
  return error
}

export function installStudioShapesBridge(editor: Editor): boolean {
  const boot = parseBootConfig()
  if (!boot || !boot.scope || !boot.origins) return false
  const hostOrigin = boot.origins.hostOrigin
  const toolOrigin = boot.origins.toolOrigin
  const scope = boot.scope
  if (
    boot.protocolVersion !== PROTOCOL_VERSION ||
    scope.toolId !== TOOL_ID ||
    typeof hostOrigin !== 'string' ||
    typeof toolOrigin !== 'string'
  ) {
    return false
  }
  if (window.location.origin !== toolOrigin) {
    showFatal('This Shapes editor is not running on its expected origin.')
    return true
  }

  const capabilities = {
    toolId: TOOL_ID,
    adapterVersion: '1.0.0',
    protocolVersion: PROTOCOL_VERSION,
    integrationMode: 'isolated-iframe',
    supported: [
      'open-canvas',
      'import-3d',
      'export-image',
      'transparent-render',
      'editable-source',
      'bridge',
    ],
    limitations: [
      {
        code: 'NO_STANDALONE_PERSISTENCE',
        summary:
          'The preserved Shapes editor has no project save/load of its own; Studio stores its versioned source document.',
        environmentDependent: false,
      },
      {
        code: 'SCENE_SCOPE',
        summary:
          'Shapes supports single-object selection, fixed-parameter face tools, render-time deformations and visual instances. Booleans/CSG are preserved dead code and are not presented as working.',
        environmentDependent: false,
      },
      {
        code: 'FBX_LIMITS',
        summary:
          'FBX import merges meshes, centres/fits geometry, and discards materials, UVs, hierarchy and animation.',
        environmentDependent: false,
      },
      {
        code: 'WEBGL_REQUIRED',
        summary: 'Transparent rendering requires an available WebGL context. Context loss is reported honestly.',
        environmentDependent: true,
      },
      {
        code: 'BROWSER_FONT',
        summary: 'The Shapes UI uses Instrument Sans from Google Fonts; the 3D scene itself does not depend on it.',
        environmentDependent: true,
      },
    ],
    outputFormats: ['png'],
    runtimeRequirements: {
      secureContext: false,
      indexedDb: false,
      networkOrigins: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
    },
  }

  let initialized = false
  let restoring = false
  let lastContext: { activeArtboard?: { width: number; height: number; index: number } } | null = null
  let dirtyTimer = 0

  editor.subscribe(() => {
    if (!initialized || restoring) return
    window.clearTimeout(dirtyTimer)
    dirtyTimer = window.setTimeout(() => postEvent({ type: 'dirty', dirty: true }), 80)
  })

  window.addEventListener('message', handleMessage)
  // React mounts asynchronously; install the host context chrome and announce
  // readiness only once the Shapes UI actually exists.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      installEmbedChrome()
      announceReady()
    })
  })
  return true

  function announceReady(): void {
    postEvent({ type: 'ready', capabilities })
  }

  function postEvent(event: Record<string, unknown>): void {
    if (window.parent === window) return
    window.parent.postMessage(
      {
        protocolVersion: PROTOCOL_VERSION,
        kind: 'event',
        scope,
        event,
        sentAt: new Date().toISOString(),
      },
      hostOrigin,
    )
  }

  function reply(message: Record<string, unknown>): void {
    if (window.parent === window) return
    window.parent.postMessage(message, hostOrigin)
  }

  function errorResponse(requestId: string, method: string, code: string, message: string, retryable: boolean) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      kind: 'response',
      scope,
      requestId,
      method,
      ok: false,
      error: { code, message, retryable },
      sentAt: new Date().toISOString(),
    }
  }

  function okResponse(requestId: string, method: string, result: unknown) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      kind: 'response',
      scope,
      requestId,
      method,
      ok: true,
      result,
      sentAt: new Date().toISOString(),
    }
  }

  function scopesMatch(candidate: unknown): candidate is BootScope {
    if (!candidate || typeof candidate !== 'object') return false
    const value = candidate as Record<string, unknown>
    return (
      value.projectId === scope.projectId &&
      value.sessionId === scope.sessionId &&
      value.toolId === scope.toolId &&
      value.channelId === scope.channelId
    )
  }

  function handleMessage(event: MessageEvent): void {
    if (event.source !== window.parent) return
    if (event.origin !== hostOrigin) return
    const message = event.data as StudioRequest | undefined
    if (!message || typeof message !== 'object' || message.kind !== 'request') return
    if (typeof message.requestId !== 'string' || typeof message.method !== 'string') return
    if (message.protocolVersion !== PROTOCOL_VERSION || !scopesMatch(message.scope)) {
      reply(
        errorResponse(
          message.requestId,
          message.method,
          'SCOPE_MISMATCH',
          'The Studio session does not match this Shapes editor.',
          false,
        ),
      )
      return
    }
    void Promise.resolve()
      .then(() => dispatch(message.method, message.params ?? {}))
      .then((result) => reply(okResponse(message.requestId, message.method, result)))
      .catch((error: unknown) => {
        const structured = structuredError(error)
        reply(
          errorResponse(
            message.requestId,
            message.method,
            structured.code,
            structured.message,
            structured.retryable,
          ),
        )
      })
  }

  function dispatch(method: string, params: Record<string, unknown>): unknown {
    switch (method) {
      case 'tool/initialize': {
        initialized = true
        return openResult()
      }
      case 'tool/open': {
        if (params.global && typeof params.global === 'object') {
          lastContext = params.global as typeof lastContext
        }
        updateContextChip()
        return openResult()
      }
      case 'context/update': {
        lastContext = params as typeof lastContext
        updateContextChip()
        return {
          applied: true,
          activeArtboardId:
            params && typeof params === 'object' && params.activeArtboard && typeof params.activeArtboard === 'object'
              ? String((params.activeArtboard as { id?: unknown }).id ?? '')
              : '',
        }
      }
      case 'assets/input':
        return receiveInputAssets(params)
      case 'state/restore':
        return restoreSourceState(params)
      case 'state/serialize':
        return serializeSourceState()
      case 'render':
        return renderArtwork(params)
      case 'capabilities/report':
        return capabilities
      case 'operation/cancel':
        return { cancelled: false }
      case 'tool/close':
        return { closed: true }
      default:
        throw adapterError('UNKNOWN_METHOD', `Unknown Shapes bridge method: ${method}`)
    }
  }

  function openResult() {
    return { sessionId: scope.sessionId, capabilities, warnings: [] }
  }

  function receiveInputAssets(params: Record<string, unknown>) {
    const assets = Array.isArray(params) ? params : []
    return assets.map((input: unknown) => {
      const layerId =
        input && typeof input === 'object' && typeof (input as { layerId?: unknown }).layerId === 'string'
          ? (input as { layerId: string }).layerId
          : undefined
      return {
        inputLayerId: layerId,
        accepted: false,
        message:
          'Shapes publishes a transparent 3D render; it does not import host rasters. Use Continue in Image for image treatments.',
      }
    })
  }

  function restoreSourceState(params: Record<string, unknown>) {
    if (
      params.tool !== TOOL_ID ||
      params.mimeType !== SHAPES_SOURCE_MIME ||
      params.toolStateVersion !== SHAPES_SOURCE_VERSION
    ) {
      return {
        restored: false,
        warnings: ['The saved source document is not a supported Shapes 1.0.0 document.'],
      }
    }
    const content = params.content
    if (typeof content !== 'string' && !(content instanceof Uint8Array)) {
      return { restored: false, warnings: ['The saved Shapes document is missing its content.'] }
    }
    restoring = true
    try {
      editor.restoreSource(typeof content === 'string' ? content : new TextDecoder().decode(content))
      return { restored: true, warnings: [] }
    } catch (error) {
      return {
        restored: false,
        warnings: [error instanceof Error ? error.message : 'The saved Shapes document could not be restored.'],
      }
    } finally {
      restoring = false
      window.clearTimeout(dirtyTimer)
    }
  }

  function serializeSourceState() {
    const snapshot = editor.snapshot()
    return {
      tool: TOOL_ID,
      toolStateVersion: SHAPES_SOURCE_VERSION,
      mimeType: SHAPES_SOURCE_MIME,
      content: editor.serializeSource(),
      label: `Shapes · ${snapshot.document.objects.length} object${snapshot.document.objects.length === 1 ? '' : 's'}`,
    }
  }

  async function renderArtwork(params: Record<string, unknown>) {
    if (params.format !== 'png') {
      throw adapterError('CAPABILITY_UNSUPPORTED', 'Shapes publishes PNG artwork; that render format is unsupported.')
    }
    if (params.background && params.background !== 'transparent') {
      throw adapterError('CAPABILITY_UNSUPPORTED', 'Shapes transparency cannot be replaced with a background.')
    }
    const artboard = params.artboard as { width?: unknown; height?: unknown } | undefined
    const scale = typeof params.scale === 'number' && Number.isFinite(params.scale) ? params.scale : 1
    if (!artboard || typeof artboard.width !== 'number' || typeof artboard.height !== 'number') {
      throw adapterError('INVALID_CONTEXT', 'The host did not supply an artboard for the Shapes render.')
    }
    const width = Math.round(artboard.width * scale)
    const height = Math.round(artboard.height * scale)
    postEvent({ type: 'progress', operation: 'render', progress: 0.2 })
    const result = await renderTransparentPng(editor.snapshot(), { width, height, background: 'transparent' })
    postEvent({ type: 'progress', operation: 'render', progress: 0.9 })
    return {
      requestId: typeof params.requestId === 'string' ? params.requestId : '',
      rendered: {
        kind: 'image',
        mimeType: 'image/png',
        width: result.width,
        height: result.height,
        hasAlpha: true,
      },
      bytes: result.bytes,
      sourceRevision: SHAPES_SOURCE_VERSION,
      warnings: [],
    }
  }

  function installEmbedChrome(): void {
    document.title = 'Shapes · Studio'
    document.body.classList.add('studio-embedded')
    const style = document.createElement('style')
    style.id = 'studio-shapes-embed-style'
    style.textContent = [
      'body.studio-embedded .studio-shapes-context{display:flex;align-items:baseline;gap:8px;min-width:0;margin-left:12px;margin-right:auto}',
      'body.studio-embedded .studio-shapes-context strong{font-size:11px;font-weight:650;letter-spacing:.14em;text-transform:uppercase;color:#236F72}',
      'body.studio-embedded .studio-shapes-context span{font-size:11px;color:#526C6E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      'body.studio-embedded .studio-shapes-context i{width:5px;height:5px;border-radius:50%;background:#236F72;display:inline-block;margin-right:5px;vertical-align:1px}',
    ].join('\n')
    document.head.appendChild(style)
    const header = document.querySelector('header')
    if (header) {
      const context = document.createElement('div')
      context.className = 'studio-shapes-context'
      context.setAttribute('data-testid', 'shapes-studio-context')
      const title = document.createElement('strong')
      title.textContent = 'Studio · Shapes'
      const meta = document.createElement('span')
      meta.id = 'studioShapesContext'
      meta.textContent = '3D source'
      context.append(title, meta)
      header.appendChild(context)
    }
    const badge = document.createElement('span')
    badge.hidden = true
    badge.id = 'studioShapesBridgeReady'
    badge.textContent = 'ready'
    document.body.appendChild(badge)
  }

  function updateContextChip(): void {
    const chip = document.getElementById('studioShapesContext')
    if (!chip) return
    const artboard = lastContext?.activeArtboard
    if (!artboard) {
      chip.textContent = '3D source'
      return
    }
    chip.innerHTML = ''
    const dot = document.createElement('i')
    dot.setAttribute('aria-hidden', 'true')
    chip.appendChild(dot)
    const ratio =
      artboard.width === artboard.height
        ? '1:1'
        : artboard.width / artboard.height === 0.8
          ? '4:5'
          : artboard.width / artboard.height === 1080 / 1920
            ? '9:16'
            : `${artboard.width}:${artboard.height}`
    chip.appendChild(
      document.createTextNode(
        `Artboard ${String((artboard.index || 0) + 1).padStart(2, '0')} · ${ratio} · ${artboard.width}×${artboard.height}`,
      ),
    )
  }

  function showFatal(message: string): void {
    const node = document.createElement('div')
    node.setAttribute('role', 'alert')
    node.style.cssText =
      "position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:#fff;color:#7a1f1f;font:500 14px/1.5 'Instrument Sans',sans-serif;padding:24px;text-align:center"
    node.textContent = message
    document.body.appendChild(node)
  }
}
