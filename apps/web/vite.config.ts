import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, el WebSocket pasa por el proxy de Vite: así el móvil que abre la web por la IP
// del ordenador también llega al servidor sin configurar CORS ni la URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/health': 'http://localhost:3001',
      '/client-errors': 'http://localhost:3001',
    },
  },
});
