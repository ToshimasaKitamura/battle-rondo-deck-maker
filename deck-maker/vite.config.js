import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/battle-rondo-deck-maker/', // GitHub Pages用
  server: {
    host: true, // ネットワークからのアクセスを許可
  },
})
