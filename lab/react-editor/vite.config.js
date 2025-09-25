import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, '../src/public/vendor/react-editor'),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, 'src', 'index.jsx'),
      name: 'ReactEditorBundle',
      fileName: 'react-editor'
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      }
    }
  }
});
