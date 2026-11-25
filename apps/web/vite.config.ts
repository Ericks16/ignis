import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// En desarrollo, /api y /socket.io se redirigen al backend para que la cookie de sesión sea del mismo origen.
const target = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': target, '/socket.io': { target, ws: true } } },
});
