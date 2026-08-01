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

// Stub native-only packages that can't bundle for web.
const WEB_EMPTY_MODULES = new Set(['@stripe/stripe-react-native']);
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_EMPTY_MODULES.has(moduleName)) {
    return { type: 'empty' };
  }
  if (defaultResolveRequest) return defaultResolveRequest(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
