/**
 * Generate Chrome extension icons in all required sizes
 * Usage: node scripts/generate-icons.js <source-image-path>
 */

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Chrome extension icon sizes
const ICON_SIZES = [16, 32, 48, 128];

async function generateIcons(sourcePath) {
  const iconsDir = path.join(rootDir, 'assets', 'icons');
  
  // Ensure icons directory exists
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  console.log(`Generating icons from: ${sourcePath}`);
  console.log(`Output directory: ${iconsDir}`);

  for (const size of ICON_SIZES) {
    const outputPath = path.join(iconsDir, `icon-${size}.png`);
    
    await sharp(sourcePath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(outputPath);
    
    console.log(`✓ Created icon-${size}.png (${size}x${size})`);
  }

  console.log('\nAll icons generated successfully!');
  console.log('\nUpdate your manifest.json with:');
  console.log(JSON.stringify({
    icons: {
      "16": "assets/icons/icon-16.png",
      "32": "assets/icons/icon-32.png",
      "48": "assets/icons/icon-48.png",
      "128": "assets/icons/icon-128.png"
    }
  }, null, 2));
}

// Get source path from command line or use default
const sourcePath = process.argv[2];

if (!sourcePath) {
  console.error('Usage: node scripts/generate-icons.js <source-image-path>');
  process.exit(1);
}

generateIcons(sourcePath).catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
