const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot  = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Include monorepo packages in Metro's file watcher
config.watchFolders = [workspaceRoot];

// Resolve packages from both local and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// The workspace root is watched (above), and the API appends to *.log files
// there while it runs. Without this, every log write invalidates the graph and
// the browser full-reloads every few seconds. Keep the default patterns.
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList)
    ? defaultBlockList
    : defaultBlockList
      ? [defaultBlockList]
      : []),
  /[\\/][^\\/]*\.log$/,
];

// node-vibrant/browser (pulled in by react-native-image-colors on web) has an
// "exports" target of "./../dist/esm/browser.js"; ".." is invalid per the Node
// spec, so Metro warns on every bundle before falling back to the same file.
// Point straight at it to skip the bad exports map.
const NODE_VIBRANT_BROWSER = path.resolve(
  workspaceRoot,
  'node_modules/node-vibrant/dist/esm/browser.js',
);
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'node-vibrant/browser') {
    return { type: 'sourceFile', filePath: NODE_VIBRANT_BROWSER };
  }
  if (defaultResolveRequest) return defaultResolveRequest(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
