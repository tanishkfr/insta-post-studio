/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Studio serves this bundle from /tools/shapes/. Relative asset URLs keep
  // JS, CSS and dynamic chunks resolvable under that stable nested route while
  // the same build still works when opened from a plain static directory.
  base: './',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
