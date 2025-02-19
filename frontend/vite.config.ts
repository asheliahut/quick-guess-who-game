// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    allowedHosts: [
      "ashelia-pc.home.cuddle.zone",
      "localhost"
    ]
  },
  plugins: [react()],
});
