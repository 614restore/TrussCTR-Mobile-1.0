import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
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
