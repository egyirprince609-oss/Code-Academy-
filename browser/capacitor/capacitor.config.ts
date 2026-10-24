import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.codeacademy.browser',
  appName: 'Code Academy Browser',
  webDir: 'www',
  bundledWebRuntime: false,
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false }
};
export default config;
