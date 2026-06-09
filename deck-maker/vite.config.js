import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/battle-rondo-deck-maker/',
  server: {
    host: true, // ネットワークからのアクセスを許可
  },
  build: {
    copyPublicDir: true,
  },
  publicDir: 'public',
})
