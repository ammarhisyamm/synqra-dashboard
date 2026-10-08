import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { workspaceRelease } from './scripts/release-id.mjs';

const release = process.env.RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA || await workspaceRelease();

export default defineConfig({
  build:{ manifest:'asset-manifest.json' },
  define: { __SYNQRA_RELEASE__:JSON.stringify(release) },
  plugins: [
    react(),tailwindcss(),
    { name:'release-manifest',generateBundle(){this.emitFile({ type:'asset',fileName:'release.json',source:JSON.stringify({ release }) });} }
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      { find: /^@phosphor-icons\/react$/, replacement: fileURLToPath(new URL('./src/phosphor-icons-proxy.js', import.meta.url)) },
    ],
  },
});
