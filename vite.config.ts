import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/bundler-plugins/vite'
import { isReleaseIdentifier } from './server/shared/frontend-diagnostics.ts'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'SENTRY_'])
  const monitored = command === 'build' && Boolean(env.VITE_SENTRY_DSN?.trim())
  const release = env.VITE_APP_RELEASE?.trim()
  if (monitored && (!isReleaseIdentifier(release) || !env.SENTRY_ORG || !env.SENTRY_PROJECT || !env.SENTRY_AUTH_TOKEN)) {
    throw new Error('Sentry 发布构建需要 VITE_APP_RELEASE、SENTRY_ORG、SENTRY_PROJECT 和 SENTRY_AUTH_TOKEN')
  }

  return {
    plugins: [
      react(),
      {
        name: 'teao-release-marker',
        transformIndexHtml: () => [{
          tag: 'meta',
          attrs: { name: 'teao-release', content: isReleaseIdentifier(release) ? release : 'unknown' },
          injectTo: 'head',
        }],
      },
      monitored && sentryVitePlugin({
        org: env.SENTRY_ORG,
        project: env.SENTRY_PROJECT,
        authToken: env.SENTRY_AUTH_TOKEN,
        release: { name: release },
        telemetry: false,
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      }),
    ],
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/api": "http://127.0.0.1:3899",
      },
    },
    build: {
      sourcemap: monitored ? 'hidden' : false,
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
  }
})
