#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const sharp = require('sharp');

const input = path.resolve(__dirname, '..', 'assets', 'icon.png');
const output = path.resolve(__dirname, '..', 'assets');

if (!fs.existsSync(input)) {
  console.error('Error: input icon not found at', input);
  process.exit(1);
}

console.log('Generating icons from', input, 'into', output);

// sizes required for favicon + icns + ico
const sizes = [16, 24, 32, 48, 57, 64, 72, 96, 120, 128, 144, 152, 195, 228, 256, 512, 1024];

// create a temporary working directory to place size PNGs
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-gen-'));

(async () => {
  try {
    // generate resized PNGs
    await Promise.all(sizes.map(size => {
      const outFile = path.join(workDir, `${size}.png`);
      return sharp(input).resize(size, size, { fit: 'cover' }).png().toFile(outFile);
    }));

    console.log('Resized PNGs written to', workDir);

    // call icon-gen programmatically (avoid npx path issues)
    try {
      const generateIcon = require('icon-gen');
      await generateIcon(workDir, output, { icns: {}, ico: {}, favicon: {}, report: true });
      console.log('Icons generated successfully.');
    } catch (err) {
      console.error('icon-gen (programmatic) failed:', err);
      process.exit(1);
    }
  } catch (err) {
    console.error('Icon generation failed:', err);
    process.exit(1);
  } finally {
    // clean up work dir
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch (e) {
      // ignore cleanup errors
    }
  }
})();
