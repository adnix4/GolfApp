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

module.exports = config;
