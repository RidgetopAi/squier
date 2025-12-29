const fs = require('fs');

// Try to use canvas if available, otherwise create minimal valid PNGs
let createCanvas;
try {
  createCanvas = require('canvas').createCanvas;
} catch (e) {
  console.log('canvas not available, creating minimal PNGs');
  createCanvas = null;
}

function createMinimalPng(size) {
  // Minimal valid PNG - solid cyan square
  // This is a very basic PNG without compression
  const png = require('pngjs').PNG;
  const image = new png({ width: size, height: size });

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      // Cyan color #06b6d4
      image.data[idx] = 6;      // R
      image.data[idx + 1] = 182; // G
      image.data[idx + 2] = 212; // B
      image.data[idx + 3] = 255; // A
    }
  }

  return png.sync.write(image);
}

function createIconWithCanvas(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background - dark
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, size, size);

  // Cyan circle
  ctx.beginPath();
  ctx.arc(size/2, size/2, size * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = '#06b6d4';
  ctx.fill();

  // Letter S
  ctx.font = `bold ${size * 0.4}px sans-serif`;
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', size/2, size/2 + size * 0.02);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buffer);
  console.log(`Created ${filename} (${size}x${size})`);
}

function createIconWithPngjs(size, filename) {
  const { PNG } = require('pngjs');
  const image = new PNG({ width: size, height: size });

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.35;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;

      // Check if inside circle
      const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

      if (dist <= radius) {
        // Cyan #06b6d4
        image.data[idx] = 6;
        image.data[idx + 1] = 182;
        image.data[idx + 2] = 212;
        image.data[idx + 3] = 255;
      } else {
        // Dark background #111827
        image.data[idx] = 17;
        image.data[idx + 1] = 24;
        image.data[idx + 2] = 39;
        image.data[idx + 3] = 255;
      }
    }
  }

  const buffer = PNG.sync.write(image);
  fs.writeFileSync(filename, buffer);
  console.log(`Created ${filename} (${size}x${size})`);
}

// Install pngjs if needed and generate icons
const { execSync } = require('child_process');

try {
  require('pngjs');
} catch (e) {
  console.log('Installing pngjs...');
  execSync('npm install pngjs --save-dev', { stdio: 'inherit' });
}

const sizes = [
  { size: 192, name: 'public/icon-192.png' },
  { size: 512, name: 'public/icon-512.png' },
  { size: 72, name: 'public/badge-72.png' },
  { size: 180, name: 'public/apple-touch-icon.png' },
];

for (const { size, name } of sizes) {
  if (createCanvas) {
    createIconWithCanvas(size, name);
  } else {
    createIconWithPngjs(size, name);
  }
}

console.log('Done!');
