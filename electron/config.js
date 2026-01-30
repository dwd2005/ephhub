const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const initial = { roots: [], lastRootId: null };
    fs.ensureFileSync(CONFIG_FILE);
    fs.writeJsonSync(CONFIG_FILE, initial, { spaces: 2 });
    return initial;
  }
  return fs.readJsonSync(CONFIG_FILE);
}

function writeConfig(nextConfig) {
  fs.ensureFileSync(CONFIG_FILE);
  fs.writeJsonSync(CONFIG_FILE, nextConfig, { spaces: 2 });
}

module.exports = {
  CONFIG_FILE,
  readConfig,
  writeConfig
};
