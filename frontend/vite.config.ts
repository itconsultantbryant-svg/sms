import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = (env.VITE_API_URL || '').trim();

  // Electron desktop builds load from file://, so assets must be referenced with
  // relative paths ("./"). The web build is served from the domain root, where an
  // absolute base ("/") keeps deep-link refreshes working.
  const base = mode === 'electron' ? './' : '/';

  return {
    base,
    plugins: [react(), ...(mode === 'electron' ? [] : [{
      name: 'afrimind-offline-shell',
      writeBundle(options, bundle) {
        const assets = [...new Set(['/index.html', ...Object.keys(bundle).filter(name => /\.(js|css)$/.test(name)).map(name => `/${name}`)])];
        const source = fs.readFileSync(path.resolve('offline-worker.js'), 'utf8')
          .replace('__AFRIMIND_CACHE__', `afrimind-shell-${Date.now()}`)
          .replace('__AFRIMIND_ASSETS__', JSON.stringify(assets));
        fs.writeFileSync(path.resolve(options.dir || 'dist', 'service-worker.js'), source);
      },
    }])],
    server: {
      port: 5173,
      proxy: { '/api': 'http://localhost:3001' },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
    // Only override when a real value exists — never bake in `undefined`.
    // For the `electron` mode VITE_API_URL is intentionally left empty so the
    // app discovers the local backend URL at runtime via the preload bridge.
    define: apiUrl
      ? {
          'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
        }
      : undefined,
  };
});
