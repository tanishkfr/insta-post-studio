import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createEditor } from './editor/store'
import { Studio } from './ui/Studio'
import './index.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing #root')
}

createRoot(root).render(
  <StrictMode>
    <Studio editor={createEditor()} />
  </StrictMode>,
)
