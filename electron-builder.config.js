/**
 * electron-builder configuration with conditional code signing.
 * Signing is only enabled when the required environment variables are present.
 * For local development (no certs), it produces unsigned builds.
 * CI sets the secrets to enable signing + notarization.
 */

module.exports = {
  appId: 'com.svl-sms.desktop',
  productName: 'SVL-SMS',
  copyright: 'Copyright © AfriMind Tech & AI Consulting Agency (AfriMind)',

  directories: {
    buildResources: 'assets',
    output: 'out',
  },

  // CRITICAL: Rebuild native modules against Electron's ABI during packaging.
  // This ensures better-sqlite3 is compiled for Electron's Node (module 112), not system Node (module 137).
  npmRebuild: true,

  files: [
    'dist/electron/**/*',
    'dist/frontend/**/*',
    'dist/backend/**/*',
    'package.json',
    'node_modules/**/*',
    '!node_modules/typescript{,/**/*}',
    '!node_modules/@types{,/**/*}',
    '!node_modules/electron{,/**/*}',
    '!node_modules/electron-builder{,/**/*}',
    '!node_modules/archiver{,/**/*}',
    '!node_modules/concurrently{,/**/*}',
    '!node_modules/wait-on{,/**/*}',
    '!node_modules/**/{test,tests,docs,examples,example}{,/**/*}',
    '!node_modules/**/*.md',
    '!node_modules/**/CHANGELOG*',
  ],

  extraMetadata: {
    main: 'dist/electron/main.js',
  },

  asar: true,
  asarUnpack: [
    'dist/backend/**/*',
    'node_modules/**/*',
  ],

  // Windows — classic Setup.exe installer (zipped after build for distribution)
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    artifactName: 'SVL-SMS-Setup-${version}.${ext}',
    // Signing is driven entirely by electron-builder's native env vars
    // (CSC_LINK / CSC_KEY_PASSWORD / CSC_NAME). CSC_LINK may be a file path OR a
    // base64 string (CI passes base64), so we do NOT gate on fs.existsSync here —
    // that would wrongly force an unsigned build in CI. electron-builder reads
    // these vars itself; with none set it produces an unsigned build
    // (forceCodeSigning is false, so that's allowed).
    ...(process.env.CSC_NAME ? { publisherName: process.env.CSC_NAME } : {}),
    forceCodeSigning: false,
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'SVL-SMS',
    installerLanguages: ['en_US'],
    deleteAppDataOnUninstall: false,
    artifactName: 'SVL-SMS-Setup-${version}.${ext}',
  },

  // macOS — DMG + ZIP with optional signing + notarization
  mac: {
    target: ['dmg', 'zip'],
    category: 'public.app-category.business',
    entitlements: 'electron/entitlements.mac.plist',
    entitlementsInherit: 'electron/entitlements.mac.plist',
    // Conditional signing + notarization
    ...(process.env.CSC_NAME && process.env.APPLE_ID && process.env.APPLE_ID_PASS && process.env.APPLE_TEAM_ID
      ? {
          identity: process.env.CSC_NAME,
          hardenedRuntime: true,
          gatekeeperAssess: true,
        }
      : {}),
  },

  dmg: {
    title: 'Install ${productName}',
  },

  linux: {
    target: ['AppImage'],
    category: 'Office',
    artifactName: '${productName}-${version}.${ext}',
  },

  publish: {
    provider: 'github',
    owner: 'itconsultantbryant-svg',
    repo: 'svl_sms',
    releaseType: 'release',
    vPrefixedTagName: true,
  },
};
