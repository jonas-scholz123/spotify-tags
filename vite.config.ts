import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset paths, so the build works under a sub-path such as GitHub Pages' /<repo>/.
  base: './',
  plugins: [react()],
  // Spotify rejects `localhost` redirect URIs, so the dev server must stay on this exact origin.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})
