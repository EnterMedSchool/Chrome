/**
 * Package the extension for Chrome Web Store submission
 * Creates a .zip file from the dist/ directory
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');
const outputDir = join(rootDir, 'releases');

// Ensure releases directory exists
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// Read version from manifest
const manifest = JSON.parse(readFileSync(join(rootDir, 'manifest.json'), 'utf-8'));
const version = manifest.version;

const outputPath = join(outputDir, `ems-medical-glossary-v${version}.zip`);

// Create zip archive
const output = createWriteStream(outputPath);
const archive = archiver('zip', {
  zlib: { level: 9 }, // Maximum compression
});

output.on('close', () => {
  console.log(`✅ Extension packaged successfully!`);
  console.log(`   File: ${outputPath}`);
  console.log(`   Size: ${(archive.pointer() / 1024).toFixed(2)} KB`);
});

archive.on('error', err => {
  throw err;
});

archive.pipe(output);
archive.directory(distDir, false);
archive.finalize();
