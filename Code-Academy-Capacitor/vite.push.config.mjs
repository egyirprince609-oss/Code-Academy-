import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  configFile: false,
  build: {
    outDir: 'www',
    emptyOutDir: false,
    lib: { entry: resolve(process.cwd(), 'native-src/push.js'), name: 'CodeAcademyPushBundle', formats: ['iife'], fileName: () => 'capacitor-push.js' }
  }
});
