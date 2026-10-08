import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/agenda/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        // O inbox abre um SSE em /api/realtime. Sem desligar a compressao o
        // proxy de desenvolvimento segura os eventos no buffer e o tempo real
        // so aparece em producao — o pior lugar para descobrir isso.
        headers: { 'Accept-Encoding': 'identity' },
      },
    },
    watch: {
      ignored: ['**/src-tauri/target/**'],
    },
  },
})
