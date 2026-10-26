import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createEditor } from './editor/store'
import { installStudioShapesBridge } from './studioBridge'
import { Studio } from './ui/Studio'
import './index.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing #root')
}

const editor = createEditor()
// In a Studio session this installs the scoped ToolAdapterV1 bridge. When
// Shapes is opened directly, the hash is absent and the original standalone
// editor behaves exactly as before.
installStudioShapesBridge(editor)

createRoot(root).render(
  <StrictMode>
    <Studio editor={editor} />
  </StrictMode>,
)
