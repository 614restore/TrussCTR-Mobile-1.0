import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

// TrussCTR must only use its own Supabase project; QuoteMGR's projects are
// read-only. Any other real project fails the build (placeholders are allowed).
const TRUSSCTR_SUPABASE_REF = 'llamtjsquoqlejznmyjl';

export default defineConfig(({mode, command}) => {
  const env = loadEnv(mode, '.', '');
  const supabaseRef = (env.VITE_SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1];
  if (command === 'build' && supabaseRef && supabaseRef !== TRUSSCTR_SUPABASE_REF) {
    throw new Error(
      `VITE_SUPABASE_URL points at Supabase project ${supabaseRef}, not TrussCTR production (${TRUSSCTR_SUPABASE_REF}). ` +
      'QuoteMGR projects are read-only for TrussCTR.'
    );
  }
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Core React — cached separately, rarely changes
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            // Supabase is large (~120 kB) — split so it caches independently
            'vendor-supabase': ['@supabase/supabase-js'],
            // Capacitor core — small but split for clarity
            'vendor-capacitor': ['@capacitor/core', '@capacitor/splash-screen'],
          },
        },
      },
      // Raise the warning threshold — html2pdf/html2canvas are intentionally large lazy chunks
      chunkSizeWarningLimit: 1000,
    },
  };
});
