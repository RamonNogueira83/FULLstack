import { defineConfig } from 'vite';

const backendTarget = `http://127.0.0.1:${process.env.PORT || 3001}`;

export default defineConfig({
  server: {
    proxy: {
      '/api': backendTarget,
      '/socket.io': {
        target: backendTarget,
        ws: true,
      },
    },
  },
});
