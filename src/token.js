'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function getConfigPath() {
  return path.join(os.homedir(), '.clawtab', 'config.json');
}

function readConfig(configPath = getConfigPath()) {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  if (!raw.trim()) {
    return {};
  }

  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`invalid config file: ${configPath}`);
  }

  return parsed;
}

function writeConfig(config, configPath = getConfigPath()) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function resolveToken() {
  if (process.env.CLAWTAB_TOKEN) {
    return {
      token: process.env.CLAWTAB_TOKEN,
      source: 'env',
      configPath: getConfigPath(),
      created: false,
    };
  }

  const configPath = getConfigPath();
  const config = readConfig(configPath);

  if (typeof config.token === 'string' && config.token.trim()) {
    return {
      token: config.token.trim(),
      source: 'config',
      configPath,
      created: false,
    };
  }

  const token = generateToken();
  writeConfig({ ...config, token }, configPath);

  return {
    token,
    source: 'generated',
    configPath,
    created: true,
  };
}

module.exports = {
  getConfigPath,
  readConfig,
  writeConfig,
  generateToken,
  resolveToken,
};
