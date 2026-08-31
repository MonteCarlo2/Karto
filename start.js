'use strict';
/**
 * Точка входа для Timeweb Nest/Node: команда запуска `node start.js` из корня репозитория.
 * Находит server.js внутри .next/standalone (путь может отличаться на Linux vs Windows).
 */
const fs = require('fs');
const path = require('path');
const { getStandaloneAppDir } = require('./scripts/standalone-paths');

const repoRoot = __dirname;

if (!process.env.HOSTNAME) {
  process.env.HOSTNAME = '0.0.0.0';
}
if (!process.env.NEXT_CACHE_DIR) {
  process.env.NEXT_CACHE_DIR = '/tmp';
}

const info = getStandaloneAppDir(repoRoot);
if (!info) {
  console.error('[karto] standalone-сборка не найдена. Сначала: npm run build');
  console.error('[karto] cwd=', process.cwd());
  process.exit(1);
}

const generatedStart = path.join(info.appDir, 'start.js');
console.log('[karto] repo root start.js');
console.log('[karto] appDir=', info.appDir);
console.log('[karto] PORT=', process.env.PORT || '3000');
console.log('[karto] HOSTNAME=', process.env.HOSTNAME);

if (fs.existsSync(generatedStart)) {
  require(generatedStart);
} else {
  console.warn('[karto] start.js не найден в appDir, загружаем server.js напрямую');
  require(info.serverPath);
}
