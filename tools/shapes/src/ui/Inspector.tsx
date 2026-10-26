import { useState, type ChangeEvent } from 'react'
import {
  ArrowUpFromLine,
  Box,
  Circle,
  CloudSun,
  Cone,
  Copy,
  Cylinder,
  EyeOff,
  FileBox,
  Grid3x3,
  Hexagon,
  Lamp,
  Minimize2,
  Move,
  Move3d,
  Orbit,
  Palette,
  PanelRight,
  PenLine,
  Pill,
  Rows3,
  RotateCw,
  Scaling,
  Shuffle,
  Slice,
  SlidersHorizontal,
  Square,
  Sun,
  Torus,
  Trash2,
} from 'lucide-react'
import {
  displayTransform,
  objectById,
  type ArrayLayout,
  type Axis,
  type Channel,
  type Deform,
  type GizmoTool,
} from '../editor/model'
import { COLOR_SWATCHES } from '../theme'
import { trianglesFromFbx } from './loadFbx'
import type { Editor, Snapshot } from '../editor/store'

const TOOLS: { tool: GizmoTool; label: string; icon: typeof Move }[] = [
  { tool: 'move', label: 'Move', icon: Move },
  { tool: 'rotate', label: 'Rotate', icon: RotateCw },
  { tool: 'scale', label: 'Scale', icon: Scaling },
]

const AXES: Axis[] = ['x', 'y', 'z']

function DeformFields({
  editor,
  selectedId,
  deform,
}: {
  editor: Editor
  selectedId: string | undefined
  deform: Deform | undefined
}) {
  const [local, setLocal] = useState<Deform>(deform ?? { twist: 0, taper: 0, noise: 0 })
  const [synced, setSynced] = useState(selectedId)
  if (selectedId !== synced) {
    setSynced(selectedId)
    setLocal(deform ?? { twist: 0, taper: 0, noise: 0 })
  }
  function commit(next: Deform) {
    setLocal(next)
    editor.dispatch({ kind: 'setDeform', deform: next })
  }
  return (
    <section>
      <h2>Deform</h2>
      {(
        [
          ['twist', -180, 180, 1],
          ['taper', -1, 1, 0.01],
          ['noise', 0, 0.4, 0.01],
        ] as const
      ).map(([key, min, max, step]) => (
        <label key={key} className="deform-row">
          {key}
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={local[key]}
            disabled={!selectedId}
            aria-label={key}
            onChange={(event) => setLocal({ ...local, [key]: Number(event.target.value) })}
            onPointerUp={(event) =>
              commit({ ...local, [key]: Number((event.target as HTMLInputElement).value) })
            }
          />
        </label>
      ))}
    </section>
  )
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return String(Math.round(value * 1000) / 1000)
}

function commitValue(raw: string, channel: Channel): number | null {
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  if (channel === 'scale' && value <= 0) return null
  return value
}

export function Inspector({
  editor,
  snapshot,
  onHide,
}: {
  editor: Editor
  snapshot: Snapshot
  onHide: () => void
}) {
  const selected = snapshot.selection ? objectById(snapshot.document, snapshot.selection) : undefined
  const transform = selected ? displayTransform(snapshot, selected.id) : null
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState<{ channel: Channel; axis: Axis } | null>(null)
  const [invalidAxis, setInvalidAxis] = useState<{ channel: Channel; axis: Axis } | null>(null)
  const [status, setStatus] = useState('')
  const [panel, setPanel] = useState<'object' | 'material' | 'modifiers'>('object')

  function shown(field: Channel, axis: Axis): string {
    if (!selected || !transform) return ''
    if (focused?.channel === field && focused.axis === axis) return draft
    return formatNumber(transform[field][axis])
  }

  function commit(field: Channel, axis: Axis, raw: string) {
    if (!selected) return
    const value = commitValue(raw, field)
    setFocused(null)
    if (value === null) {
      setInvalidAxis({ channel: field, axis })
      setStatus(field === 'scale' ? 'Scale must be greater than 0.' : 'Enter a number.')
      return
    }
    setInvalidAxis(null)
    setStatus('')
    editor.dispatch({ kind: 'setChannel', channel: field, axis, value })
  }

  const groups: { field: Channel; label: string }[] = [
    { field: 'position', label: 'Position' },
    { field: 'rotation', label: 'Rotation' },
    { field: 'scale', label: 'Size' },
  ]

  const arrayLayout = selected?.array?.layout ?? 'line'
  const arrayAxis = selected?.array?.axis ?? (arrayLayout === 'radial' ? 'y' : 'x')
  const arrayCount = selected?.array?.count ?? 3
  const arrayGap = selected?.array?.gap ?? 1.4
  const arraySeed = selected?.array?.seed ?? 1
  const arrayJitter = selected?.array?.jitter ?? 0

  async function importFbx(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const triangles = await trianglesFromFbx(await file.arrayBuffer())
    if (!triangles) {
      setStatus('That FBX has no usable mesh.')
      return
    }
    setInvalidAxis(null)
    setStatus('')
    editor.dispatch({ kind: 'addFbx', name: file.name, triangles })
  }

  function setArray(layout: ArrayLayout, axis: Axis, count: number, gap: number, seed = arraySeed, jitter = arrayJitter) {
    editor.dispatch({ kind: 'array', layout, axis, count, gap, seed, jitter })
  }

  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="inspector-tab-bar">
      <div className="inspector-tabs" role="tablist" aria-label="Inspector sections">
        {(
          [
            ['object', 'Object', Box],
            ['material', 'Material', Palette],
            ['modifiers', 'Modifiers', SlidersHorizontal],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-label={label}
            aria-selected={panel === id}
            aria-controls={`panel-${id}`}
            className={panel === id ? 'inspector-tab active' : 'inspector-tab'}
            tabIndex={panel === id ? 0 : -1}
            onClick={() => setPanel(id)}
            onKeyDown={(event) => {
              const order = ['object', 'material', 'modifiers'] as const
              const index = order.indexOf(id)
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
              event.preventDefault()
              const next = order[(index + (event.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length]
              if (!next) return
              setPanel(next)
              document.getElementById(`tab-${next}`)?.focus()
            }}
          >
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ))}
      </div>
      <button type="button" className="inspector-tab hide-tab" aria-label="Hide inspector" onClick={onHide}>
        <PanelRight size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      </div>
      {panel === 'object' ? (
        <div role="tabpanel" id="panel-object" aria-labelledby="tab-object" className="inspector-panel">
      <section>
        <h2>Shape</h2>
        <div className="shape-grid">
          {(
            [
              ['box', Box, 'Cube'],
              ['sphere', Circle, 'Sphere'],
              ['plane', Square, 'Plane'],
              ['cone', Cone, 'Cone'],
              ['cylinder', Cylinder, 'Cylinder'],
              ['torus', Torus, 'Torus'],
              ['capsule', Pill, 'Capsule'],
              ['custom', Hexagon, 'Custom'],
            ] as const
          ).map(([kind, Icon, label]) => (
            <button
              key={kind}
              type="button"
              className="shape-btn"
              aria-label={`Add ${label}`}
              onClick={() => editor.dispatch({ kind: 'add', shape: kind })}
            >
              <Icon size={16} strokeWidth={1.75} />
            </button>
          ))}
          <label className="shape-btn">
            <FileBox size={16} strokeWidth={1.75} aria-hidden="true" />
            <input className="sr-only" type="file" accept=".fbx" aria-label="Add FBX" onChange={(event) => void importFbx(event)} />
          </label>
        </div>
      </section>
      <section>
        <h2>Model</h2>
        <div className="tool-row" role="group" aria-label="Model">
          <button
            type="button"
            className="tool-btn"
            aria-label="Loop cut"
            disabled={!selected?.mesh}
            onClick={() => editor.dispatch({ kind: 'loopCut' })}
          >
            <Slice size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="tool-btn"
            aria-label="Extrude"
            disabled={!selected?.mesh}
            onClick={() => editor.dispatch({ kind: 'extrude' })}
          >
            <ArrowUpFromLine size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="tool-btn"
            aria-label="Inset"
            disabled={!selected?.mesh}
            onClick={() => editor.dispatch({ kind: 'inset' })}
          >
            <Minimize2 size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </section>
      <section>
        <h2>Flip</h2>
        <div className="tool-row" role="group" aria-label="Flip">
          {AXES.map((axis) => (
            <button
              key={axis}
              type="button"
              className="tool-btn"
              disabled={!selected}
              onClick={() => editor.dispatch({ kind: 'flip', axis })}
            >
              {axis.toUpperCase()}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>Tool</h2>
        <div className="tool-row" role="group" aria-label="Transform tool">
          {TOOLS.map((item) => {
            const active = snapshot.tool === item.tool
            return (
              <button
                key={item.tool}
                type="button"
                aria-pressed={active}
                aria-label={item.label}
                className={active ? 'tool-btn active' : 'tool-btn'}
                onClick={() => editor.dispatch({ kind: 'setTool', tool: item.tool })}
              >
                <item.icon size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </section>
      {groups.map((group) => (
        <section key={group.field}>
          <h2>{group.label}</h2>
          <div className="xyz">
            {AXES.map((axis) => {
              const invalid = invalidAxis?.channel === group.field && invalidAxis.axis === axis
              return (
                <label key={axis}>
                  {axis.toUpperCase()}
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={!selected}
                    value={shown(group.field, axis)}
                    aria-label={`${group.field} ${axis}`}
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? 'field-error' : undefined}
                    onFocus={() => {
                      setFocused({ channel: group.field, axis })
                      setDraft(transform ? formatNumber(transform[group.field][axis]) : '')
                    }}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={(event) => commit(group.field, axis, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                    }}
                  />
                </label>
              )
            })}
          </div>
        </section>
      ))}
      <p id="field-error" className="field-error" role="alert">
        {invalidAxis ? status : ''}
      </p>
      <button
        type="button"
        className="tool-btn"
        aria-label="Duplicate"
        disabled={!selected}
        onClick={() => editor.dispatch({ kind: 'duplicate' })}
      >
        <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="delete-btn"
        aria-label="Delete"
        disabled={!selected}
        onClick={() => {
          editor.dispatch({ kind: 'delete' })
          setStatus('Deleted. Undo is in the header.')
          setInvalidAxis(null)
        }}
      >
        <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <p className="live-status" role="status" aria-live="polite">
        {invalidAxis ? '' : status}
      </p>
        </div>
      ) : null}
      {panel === 'material' ? (
        <div role="tabpanel" id="panel-material" aria-labelledby="tab-material" className="inspector-panel">
      <section>
        <h2>Color</h2>
        <div className="swatches" role="group" aria-label="Color">
          {COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={selected?.color === swatch ? 'swatch active' : 'swatch'}
              style={{ background: swatch }}
              aria-label={swatch}
              aria-pressed={selected?.color === swatch}
              disabled={!selected}
              onClick={() => editor.dispatch({ kind: 'setColor', color: swatch })}
            />
          ))}
          <label className="swatch custom-color">
            <span className="sr-only">Custom</span>
            <input
              type="color"
              aria-label="Custom color"
              disabled={!selected}
              value={selected && /^#[0-9a-fA-F]{6}$/.test(selected.color) ? selected.color : '#193438'}
              onChange={(event) => editor.dispatch({ kind: 'setColor', color: event.target.value })}
            />
          </label>
        </div>
      </section>
      <section>
        <h2>Wireframe</h2>
        <div className="tool-row" role="group" aria-label="Wireframe">
          <button
            type="button"
            className={snapshot.wireframe ? 'tool-btn active' : 'tool-btn'}
            aria-label={snapshot.wireframe ? 'Wireframe on' : 'Wireframe off'}
            aria-pressed={snapshot.wireframe}
            onClick={() => editor.dispatch({ kind: 'setWireframe', enabled: !snapshot.wireframe })}
          >
            {snapshot.wireframe ? <Grid3x3 size={16} strokeWidth={1.75} aria-hidden="true" /> : <EyeOff size={16} strokeWidth={1.75} aria-hidden="true" />}
          </button>
        </div>
      </section>
      <section>
        <h2>Gizmo</h2>
        <div className="tool-row" role="group" aria-label="Gizmo">
          <button
            type="button"
            className={snapshot.showGizmo ? 'tool-btn active' : 'tool-btn'}
            aria-label={snapshot.showGizmo ? 'Gizmo on' : 'Gizmo off'}
            aria-pressed={snapshot.showGizmo}
            onClick={() => editor.dispatch({ kind: 'setGizmo', enabled: !snapshot.showGizmo })}
          >
            {snapshot.showGizmo ? <Move3d size={16} strokeWidth={1.75} aria-hidden="true" /> : <EyeOff size={16} strokeWidth={1.75} aria-hidden="true" />}
          </button>
        </div>
      </section>
      <section>
        <h2>Shade</h2>
        <div className="tool-row" role="group" aria-label="Shade">
          {(
            [
              ['toon', Circle],
              ['ink', PenLine],
              ['flat', Square],
            ] as const
          ).map(([shade, Icon]) => (
            <button
              key={shade}
              type="button"
              className={snapshot.shade === shade ? 'tool-btn active' : 'tool-btn'}
              aria-label={shade}
              aria-pressed={snapshot.shade === shade}
              onClick={() => editor.dispatch({ kind: 'setShade', shade })}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ))}
        </div>
        {snapshot.shade === 'ink' ? (
          <label className="ink-color">
            Ink
            <input
              type="color"
              aria-label="Ink color"
              value={snapshot.inkColor}
              onChange={(event) => editor.dispatch({ kind: 'setInkColor', color: event.target.value })}
            />
          </label>
        ) : null}
      </section>
      <section>
        <h2>Light</h2>
        <div className="tool-row" role="group" aria-label="Light">
          {(
            [
              ['studio', Sun],
              ['soft', CloudSun],
              ['rim', Lamp],
            ] as const
          ).map(([light, Icon]) => (
            <button
              key={light}
              type="button"
              className={snapshot.light === light ? 'tool-btn active' : 'tool-btn'}
              aria-label={light}
              aria-pressed={snapshot.light === light}
              onClick={() => editor.dispatch({ kind: 'setLight', light })}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
        </div>
      ) : null}
      {panel === 'modifiers' ? (
        <div role="tabpanel" id="panel-modifiers" aria-labelledby="tab-modifiers" className="inspector-panel">
      <section>
        <h2>Array</h2>
        <div className="tool-row" role="group" aria-label="Array layout">
          {(
            [
              ['line', Rows3],
              ['radial', Orbit],
              ['scatter', Shuffle],
            ] as const
          ).map(([layout, Icon]) => (
            <button
              key={layout}
              type="button"
              className={selected?.array?.layout === layout ? 'tool-btn active' : 'tool-btn'}
              aria-label={layout}
              aria-pressed={selected?.array?.layout === layout}
              disabled={!selected}
              onClick={() =>
                setArray(layout, selected?.array?.axis ?? (layout === 'radial' ? 'y' : 'x'), arrayCount, arrayGap)
              }
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ))}
        </div>
        {arrayLayout === 'scatter' ? null : (
        <div className="tool-row" role="group" aria-label="Array axis">
          {AXES.map((axis) => (
            <button
              key={axis}
              type="button"
              className={selected?.array?.axis === axis ? 'tool-btn active' : 'tool-btn'}
              aria-pressed={selected?.array?.axis === axis}
              disabled={!selected}
              onClick={() => setArray(arrayLayout, axis, arrayCount, arrayGap)}
            >
              {axis.toUpperCase()}
            </button>
          ))}
        </div>
        )}
        <div className="xyz">
          <label>
            Count
            <input
              type="number"
              min={1}
              max={20}
              disabled={!selected}
              value={selected?.array?.count ?? 1}
              aria-label="array count"
              onChange={(event) => setArray(arrayLayout, arrayAxis, Number(event.target.value), arrayGap)}
            />
          </label>
          <label>
            {arrayLayout === 'line' ? 'Gap' : 'Radius'}
            <input
              type="number"
              step={0.1}
              disabled={!selected}
              value={selected?.array?.gap ?? 1.4}
              aria-label={arrayLayout === 'line' ? 'array gap' : 'array radius'}
              onChange={(event) => setArray(arrayLayout, arrayAxis, arrayCount, Number(event.target.value))}
            />
          </label>
          <label>
            Seed
            <input
              type="number"
              min={1}
              disabled={!selected}
              value={selected?.array?.seed ?? 1}
              aria-label="array seed"
              onChange={(event) =>
                setArray(arrayLayout, arrayAxis, arrayCount, arrayGap, Number(event.target.value), arrayJitter)
              }
            />
          </label>
          <label>
            Jitter
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              disabled={!selected}
              value={selected?.array?.jitter ?? 0}
              aria-label="array jitter"
              onChange={(event) =>
                setArray(arrayLayout, arrayAxis, arrayCount, arrayGap, arraySeed, Number(event.target.value))
              }
            />
          </label>
        </div>
      </section>
      <section>
        <h2>Mirror</h2>
        <div className="tool-row" role="group" aria-label="Mirror">
          {AXES.map((axis) => (
            <button
              key={axis}
              type="button"
              className="tool-btn"
              disabled={!selected}
              onClick={() => editor.dispatch({ kind: 'mirror', axis })}
            >
              {axis.toUpperCase()}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>Remix</h2>
        <div className="tool-row" role="group" aria-label="Remix">
          <button
            type="button"
            className="tool-btn"
            disabled={!selected?.array || selected.array.count < 2}
            onClick={() => editor.dispatch({ kind: 'remix' })}
          >
            Re-roll
          </button>
        </div>
      </section>
      <section>
        <h2>Stroke</h2>
        <div className="tool-row" role="group" aria-label="Stroke">
          <button
            type="button"
            className={snapshot.drawingStroke ? 'tool-btn active' : 'tool-btn'}
            aria-pressed={snapshot.drawingStroke}
            disabled={!selected}
            onClick={() => editor.dispatch({ kind: 'setDrawing', enabled: !snapshot.drawingStroke })}
          >
            {snapshot.drawingStroke ? 'Drawing' : 'Draw'}
          </button>
          <button
            type="button"
            className="tool-btn"
            disabled={!selected?.stroke}
            onClick={() => editor.dispatch({ kind: 'setStroke', stroke: null })}
          >
            Clear
          </button>
        </div>
        <div className="xyz">
          <label>
            Spacing
            <input
              type="number"
              min={0.15}
              step={0.1}
              disabled={!selected?.stroke}
              value={selected?.stroke?.spacing ?? 0.8}
              aria-label="stroke spacing"
              onChange={(event) => {
                if (!selected?.stroke) return
                editor.dispatch({
                  kind: 'setStroke',
                  stroke: { points: selected.stroke.points.map((point) => ({ ...point })), spacing: Number(event.target.value) },
                })
              }}
            />
          </label>
        </div>
      </section>
      <DeformFields editor={editor} selectedId={selected?.id} deform={selected?.deform} />
        </div>
      ) : null}
    </aside>
  )
}
