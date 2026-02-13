import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: './assets/icon',
    appBundleId: 'com.photomind.app',
    appCategoryType: 'public.app-category.photography',
    osxSign: {},
    extendInfo: {
      NSCameraUsageDescription: 'PhotoMind needs access to camera for photo capture.',
      NSPhotoLibraryUsageDescription: 'PhotoMind needs access to photo library for management.',
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerDeb({}),
    new MakerRpm({}),
    new MakerDMG({
      format: 'ULFO',
      name: 'PhotoMind',
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker processes, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file configuration.
          // `config` can be an absolute path or relative path to the forge configuration file.
          entry: 'electron/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'electron/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
          env: {
            VITE_DEV_SERVER_PORT: '5173'
          }
        },
      ],
    }),
  ],
};

export default config;
