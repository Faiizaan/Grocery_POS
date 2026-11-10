import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Override with API_TARGET=http://localhost:4001 to point at a dev API
      '/api': process.env.API_TARGET || 'http://localhost:4000',
      '/health': process.env.API_TARGET || 'http://localhost:4000'
    }
  }
})