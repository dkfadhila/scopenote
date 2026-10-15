import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins:[react()],
  server:{host:'127.0.0.1',port:5178,strictPort:true,proxy:{'/api':process.env.SCOPENOTE_API_ORIGIN||'http://127.0.0.1:3001'}},
  preview:{port:4178,strictPort:true,proxy:{'/api':'http://127.0.0.1:3001'}},
  build:{rollupOptions:{input:{app:'index.html',draft:'draft.html'},output:{manualChunks:{motion:['motion/react'],validation:['zod']}}}}
});
