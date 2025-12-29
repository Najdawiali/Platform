import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5204,  // Fixed port
    strictPort: true,  // If 5204 is busy, fail (don't auto-increment)
    allowedHosts: [
      '.loca.lt',  // Allow all localtunnel domains
      '.ngrok-free.app',
      '.ngrok-free.dev',
      'localhost'
    ]
  }
})
