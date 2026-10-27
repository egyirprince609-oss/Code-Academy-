import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  configFile: false,
  build: {
    outDir: 'www',
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: resolve(process.cwd(), 'native-src/index.js'),
      name: 'CodeAcademyNativeBundle',
      formats: ['iife'],
      fileName: () => 'capacitor-native.js'
    }
  }
});
