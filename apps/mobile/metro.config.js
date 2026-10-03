const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// The workspace root is watched (above), and the API appends to *.log files
// there while it runs. Without this, every log write invalidates the graph and
// the app reloads every few seconds. Keep the default patterns.
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList)
    ? defaultBlockList
    : defaultBlockList
      ? [defaultBlockList]
      : []),
  /[\\/][^\\/]*\.log$/,
];

// zustand (and similar packages) expose an ESM build via the "import" condition
// that uses import.meta.env, which is invalid in a non-module <script> bundle.
// Adding "react-native" to web conditions causes Metro to prefer the CJS build
// (zustand's "react-native" export appears before "import" in its exports map).
config.resolver.unstable_conditionsByPlatform = {
  ios: ['react-native'],
  android: ['react-native'],
  web: ['browser', 'react-native'],
};

// node-vibrant/browser (pulled in by react-native-image-colors on web) has an
// "exports" target of "./../dist/esm/browser.js"; ".." is invalid per the Node
// spec, so Metro warns on every bundle before falling back to the same file.
// Point straight at it to skip the bad exports map.
const NODE_VIBRANT_BROWSER = path.resolve(
  workspaceRoot,
  'node_modules/node-vibrant/dist/esm/browser.js',
);

// Stub native-only packages that can't bundle for web. expo-sqlite is never
// opened on web (src/lib/db.ts uses a localStorage shim there), so stubbing it
// also keeps its wa-sqlite worker and .wasm out of the web bundle.
const WEB_EMPTY_MODULES = new Set(['@stripe/stripe-react-native', 'expo-sqlite']);
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_EMPTY_MODULES.has(moduleName)) {
    return { type: 'empty' };
  }
  if (moduleName === 'node-vibrant/browser') {
    return { type: 'sourceFile', filePath: NODE_VIBRANT_BROWSER };
  }
  if (defaultResolveRequest) return defaultResolveRequest(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
