import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Separa as libs do código da aplicação: no celular o vendor
        // fica em cache entre deploys, só o app é rebaixado.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react-router') || id.includes('@remix-run')) return 'router';
          if (id.includes('lucide-react')) return 'icones';
          return 'vendor';
        },
      },
    },
  },
  server: {
    // Nada fora de src/ precisa ser observado. Os templates .docx
    // travam o watcher quando estão abertos no Word (arquivos ~$ e
    // .tmp), e derrubavam o dev server com EBUSY.
    watch: {
      ignored: [
        '**/templates_contratos_cotas/**',
        '**/anexos_privados/**',
        '**/server/**',
        '**/dist/**',
      ],
    },
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
});
