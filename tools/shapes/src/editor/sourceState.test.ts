import { describe, expect, it } from 'vitest'
import { createEditor } from './store'
import { parseShapesSource, SHAPES_SOURCE_VERSION, ShapesSourceStateError } from './sourceState'

function seededEditor() {
  const editor = createEditor()
  editor.dispatch({ kind: 'add', shape: 'box' })
  editor.dispatch({ kind: 'add', shape: 'sphere' })
  editor.dispatch({ kind: 'setDeform', deform: { twist: 24, taper: 0.2, noise: 0.05 } })
  editor.dispatch({ kind: 'array', layout: 'line', axis: 'x', count: 3, gap: 1.2, seed: 7, jitter: 0.1 })
  editor.dispatch({ kind: 'setChannel', channel: 'position', axis: 'y', value: 0.5 })
  editor.dispatch({ kind: 'setColor', color: '#3B82F6' })
  editor.dispatch({ kind: 'setShade', shade: 'ink' })
  editor.dispatch({ kind: 'setLight', light: 'rim' })
  editor.dispatch({ kind: 'setTool', tool: 'rotate' })
  editor.setCamera({ theta: 0.9, phi: 1.1, radius: 12, target: { x: 1, y: 0.5, z: 0 } })
  return editor
}

describe('Shapes source state 1.0.0', () => {
  it('round-trips objects, transforms, materials, preferences, camera and history', () => {
    const source = seededEditor()
    const serialized = source.serializeSource()
    const document = JSON.parse(serialized)
    expect(document.tool).toBe('shapes')
    expect(document.schemaVersion).toBe(SHAPES_SOURCE_VERSION)
    expect(document.document.objects).toHaveLength(2)
    expect(document.history.past.length).toBeGreaterThan(2)
    expect(document.nextSerial).toBe(3)
    expect(document.pointer).toBeUndefined()
    expect(document.strokeDraft).toBeUndefined()

    const target = createEditor()
    target.restoreSource(serialized)
    const snapshot = target.snapshot()
    expect(snapshot.document.objects.map((object) => object.kind)).toEqual(['box', 'sphere'])
    expect(snapshot.document.objects[1]?.deform).toEqual({ twist: 24, taper: 0.2, noise: 0.05 })
    expect(snapshot.document.objects[1]?.array?.count).toBe(3)
    expect(snapshot.document.objects[1]?.color).toBe('#3B82F6')
    expect(snapshot.shade).toBe('ink')
    expect(snapshot.light).toBe('rim')
    expect(snapshot.tool).toBe('rotate')
    expect(snapshot.camera).toEqual({ theta: 0.9, phi: 1.1, radius: 12, target: { x: 1, y: 0.5, z: 0 } })
    expect(snapshot.canUndo).toBe(true)
  })

  it('supports native undo and redo after restoration', () => {
    const source = seededEditor()
    const target = createEditor()
    target.restoreSource(source.serializeSource())
    const before = target.snapshot()
    expect(before.document.objects[1]?.color).toBe('#3B82F6')
    target.dispatch({ kind: 'undo' })
    expect(target.snapshot().document.objects[1]?.color).toBe('#7E8BA0')
    target.dispatch({ kind: 'redo' })
    expect(target.snapshot().document.objects[1]?.color).toBe('#3B82F6')
  })

  it('rejects unsupported versions and malformed geometry without replacing editor state', () => {
    const editor = createEditor()
    editor.dispatch({ kind: 'add', shape: 'torus' })
    const original = editor.serializeSource()
    const parsed = JSON.parse(original)
    expect(() => editor.restoreSource(JSON.stringify({ ...parsed, schemaVersion: '2.0.0' }))).toThrow(
      ShapesSourceStateError,
    )
    expect(() => editor.restoreSource('{not json')).toThrow('not valid JSON')
    const malformed = JSON.parse(original)
    malformed.document.objects[0].transform.position.x = 'NaN'
    expect(() => editor.restoreSource(JSON.stringify(malformed))).toThrow('finite number')
    expect(editor.snapshot().document.objects).toHaveLength(1)
    expect(JSON.parse(editor.serializeSource()).document.objects[0].kind).toBe('torus')
  })

  it('rejects duplicate identities and non-covering next serials', () => {
    const source = seededEditor()
    const parsed = JSON.parse(source.serializeSource())
    parsed.document.objects[1].id = parsed.document.objects[0].id
    expect(() => parseShapesSource(JSON.stringify(parsed))).toThrow('duplicate object ID')
    const parsed2 = JSON.parse(source.serializeSource())
    parsed2.nextSerial = 1
    expect(() => parseShapesSource(JSON.stringify(parsed2))).toThrow('nextSerial')
  })
})
