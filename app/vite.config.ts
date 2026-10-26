import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['assets/brand/*'],
      manifest: {
        name: 'GreenMafia — ведущий',
        short_name: 'GreenMafia',
        description: 'Суфлёр, блокнот, таймер и судья для живой игры в мафию',
        lang: 'ru',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#08160F',
        theme_color: '#08160F',
        icons: [
          { src: 'assets/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'assets/brand/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webp,jpg,jpeg,mp3,ogg,m4a,wav}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  server: { port: 5173, host: true },
});
