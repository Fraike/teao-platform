import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3899",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            // Core framework — loaded on every page
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'vendor-react'
            // UI library — loaded on most pages, keep separate for cache
            if (id.includes('antd') || id.includes('@ant-design') || id.includes('dayjs')) return 'vendor-antd'
            // State management — tiny, group with react
            if (id.includes('zustand')) return 'vendor-react'
          }
          // x6, html2canvas, jspdf are auto-chunked by dynamic import — don't force-group them
        },
      },
    },
  },
})
