export const KIND_MATTE = {
  box: '#C4A574',
  sphere: '#7E8BA0',
  plane: '#9A8B6A',
  cone: '#C4847A',
  cylinder: '#6E9A8A',
  torus: '#8E7EAE',
  capsule: '#D0A06A',
  custom: '#7E9AA0',
  fbx: '#8E7E6A',
} as const

export const COLOR_SWATCHES = ['#C4A574', '#7E8BA0', '#3B82F6', '#E07A7A', '#6E9A8A', '#8E7EAE', '#193438'] as const

export const tokens = {
  background: '#FFFFFF',
  workspace: '#F3F7F6',
  hover: '#EAF1EF',
  selected: '#DCEFEB',
  accent: '#236F72',
  accentPressed: '#19595C',
  text: '#193438',
  textMuted: '#526C6E',
  border: '#DEE7E5',
  controlBorder: '#A7BFC0',
  mediaStage: '#EEF0F3',
  onMedia: '#FFFFFF',
  onStageAccent: '#7EC8CA',
  gizmoX: '#D4A0A0',
  gizmoY: '#A3C9A8',
  gizmoZ: '#A4B8D6',
  danger: '#A63036',
  font: 'Instrument Sans, Inter, system-ui, sans-serif',
  headerHeight: 56,
  inspectorWidth: 320,
  radiusControl: 8,
  radiusPanel: 10,
} as const
