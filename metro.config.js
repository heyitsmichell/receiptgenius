const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Optimize file watcher exclusion list to prevent EMFILE on macOS
config.resolver.blockList = [
  ...Array.from(config.resolver.blockList || []),
  /\/ui\/.*/,
];

module.exports = config;
