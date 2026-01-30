#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const input = path.resolve(__dirname, '..', 'assets', 'icon.png');
const output = path.resolve(__dirname, '..', 'assets');

if (!fs.existsSync(input)) {
  console.error('Error: input icon not found at', input);
  process.exit(1);
}

console.log('Generating icons from', input, 'into', output);

const cmd = 'npx';
const args = ['icon-gen', input, '-o', output];
const res = spawnSync(cmd, args, { stdio: 'inherit' });

if (res.error) {
  console.error('Error spawning icon-gen:', res.error);
  process.exit(1);
}

if (res.status !== 0) {
  console.error('icon-gen failed with exit code', res.status);
  process.exit(res.status);
}

console.log('Icons generated successfully.');
