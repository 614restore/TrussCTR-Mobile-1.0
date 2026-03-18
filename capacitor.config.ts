import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.restore614.trussctr',
  appName: 'TrussCTR',
  webDir: 'dist',
  ios: {
    scheme: 'trussctr',
    contentInset: 'automatic',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    Camera: {
      // permissions configured in Info.plist for iOS
    },
  },
  server: {
    allowNavigation: [
      '*.supabase.co',
      '*.picsum.photos',
    ],
  },
};

export default config;
