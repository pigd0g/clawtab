#!/usr/bin/env node
'use strict';

const { main } = require('../src/index');

async function run() {
  await main({
    argv: process.argv.slice(2),
    launchChrome: true,
  });
}

run().catch((err) => {
  console.error(`[clawtab] fatal: ${err.message}`);
  process.exit(1);
});
