import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.restore614.trussctr',
  appName: 'TrussCTR',
  webDir: 'dist',
  server: {
    // For physical device testing: point to your deployed Vercel URL.
    // Remove or comment out for production App Store builds (uses bundled dist/).
    // url: 'https://your-trussctr-app.vercel.app',
    cleartext: false,
  },
  plugins: {
    StatusBar: {
      style: 'Default',
      backgroundColor: '#ffffff',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1e293b',
      showSpinner: false,
    },
  },
};

export default config;
