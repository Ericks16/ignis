import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// En desarrollo, /api se redirige al backend para que la cookie de sesión sea del mismo origen.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000' } },
});
