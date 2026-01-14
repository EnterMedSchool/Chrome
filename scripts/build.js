/**
 * Custom build script for EnterMedSchool Glossary Chrome Extension
 * Runs multiple Vite builds to handle different output formats:
 * - Content script: IIFE format (required by Chrome)
 * - Service worker: ES modules (supported with type:module)
 * - HTML pages: Standard Vite HTML handling
 */

import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, mkdirSync, existsSync, cpSync, rmSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const distDir = resolve(rootDir, 'dist');

// Shared resolve config
const sharedResolve = {
  alias: {
    '@': resolve(rootDir, 'src'),
    '@data': resolve(rootDir, 'data'),
    '@styles': resolve(rootDir, 'styles'),
    '@assets': resolve(rootDir, 'assets'),
  },
};

async function buildContentScript() {
  console.log('\n📦 Building content script (IIFE format)...');
  await build({
    configFile: false,
    resolve: sharedResolve,
    build: {
      outDir: distDir,
      emptyOutDir: false,
      rollupOptions: {
        input: {
          'content-script': resolve(rootDir, 'src/content/content-script.js'),
        },
        output: {
          format: 'iife',
          entryFileNames: 'src/content/[name].js',
          inlineDynamicImports: true,
        },
      },
      minify: 'esbuild',
    },
  });
  console.log('✅ Content script built');
}

async function buildServiceWorker() {
  console.log('\n📦 Building service worker (ES module format)...');
  await build({
    configFile: false,
    resolve: sharedResolve,
    build: {
      outDir: distDir,
      emptyOutDir: false,
      rollupOptions: {
        input: {
          'service-worker': resolve(rootDir, 'src/background/service-worker.js'),
        },
        output: {
          format: 'es',
          entryFileNames: 'src/background/[name].js',
          chunkFileNames: 'src/shared/[name]-[hash].js',
        },
      },
      minify: 'esbuild',
    },
  });
  console.log('✅ Service worker built');
}

async function buildHtmlPages() {
  console.log('\n📦 Building HTML pages...');
  await build({
    configFile: false,
    resolve: sharedResolve,
    build: {
      outDir: distDir,
      emptyOutDir: false,
      rollupOptions: {
        input: {
          'popup': resolve(rootDir, 'src/popup/popup.html'),
          'onboarding': resolve(rootDir, 'src/onboarding/onboarding.html'),
          'browser': resolve(rootDir, 'src/browser/browser.html'),
          'stats': resolve(rootDir, 'src/stats/stats.html'),
        },
        output: {
          entryFileNames: 'src/[name]/[name].js',
          chunkFileNames: 'src/shared/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith('.css')) {
              // Keep CSS files in their respective folders
              return 'src/[name]/[name][extname]';
            }
            return 'assets/[name][extname]';
          },
        },
      },
      minify: 'esbuild',
    },
  });
  console.log('✅ HTML pages built');
}

function copyAssets() {
  console.log('\n📋 Copying static assets...');

  // Copy manifest.json
  copyFileSync(
    resolve(rootDir, 'manifest.json'),
    resolve(distDir, 'manifest.json')
  );

  // Copy data folder
  if (existsSync(resolve(rootDir, 'data'))) {
    cpSync(
      resolve(rootDir, 'data'),
      resolve(distDir, 'data'),
      { recursive: true }
    );
  }

  // Copy assets folder
  if (existsSync(resolve(rootDir, 'assets'))) {
    cpSync(
      resolve(rootDir, 'assets'),
      resolve(distDir, 'assets'),
      { recursive: true }
    );
  }

  // Copy styles folder
  if (existsSync(resolve(rootDir, 'styles'))) {
    cpSync(
      resolve(rootDir, 'styles'),
      resolve(distDir, 'styles'),
      { recursive: true }
    );
  }

  console.log('✅ Static assets copied');
}

async function main() {
  console.log('🚀 Building EnterMedSchool Glossary Extension...\n');

  // Clean dist directory
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true });
  }
  mkdirSync(distDir, { recursive: true });

  try {
    // Run builds in sequence
    await buildContentScript();
    await buildServiceWorker();
    await buildHtmlPages();
    copyAssets();

    console.log('\n🎉 Build complete! Extension ready in dist/\n');
  } catch (error) {
    console.error('\n❌ Build failed:', error);
    process.exit(1);
  }
}

main();
