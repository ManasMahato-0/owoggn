import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, forward /api to the FastAPI server so the app always uses relative URLs.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
})
