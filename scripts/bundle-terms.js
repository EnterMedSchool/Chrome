/**
 * Bundle all term JSON files into a single file for efficient loading
 * Run with: node scripts/bundle-terms.js
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const termsDir = join(rootDir, 'data', 'terms');
const outputFile = join(rootDir, 'data', 'terms-bundle.json');

async function findJsonFiles(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      await findJsonFiles(fullPath, files);
    } else if (entry.name.endsWith('.json') && entry.name !== 'tags.json') {
      files.push(fullPath);
    }
  }

  return files;
}

async function bundleTerms() {
  console.log('Bundling term files...');
  
  const jsonFiles = await findJsonFiles(termsDir);
  console.log(`Found ${jsonFiles.length} term files`);

  const terms = [];
  let errors = 0;

  for (const file of jsonFiles) {
    try {
      const content = await readFile(file, 'utf-8');
      if (content.trim()) {
        const term = JSON.parse(content);
        terms.push(term);
      }
    } catch (error) {
      console.error(`Error parsing ${file}:`, error.message);
      errors++;
    }
  }

  console.log(`Successfully parsed ${terms.length} terms (${errors} errors)`);

  // Write bundled output
  await writeFile(outputFile, JSON.stringify(terms, null, 0), 'utf-8');
  console.log(`Wrote ${outputFile}`);

  // Calculate statistics
  const patternCount = terms.reduce((sum, term) => {
    return sum + 
      (term.patterns?.length || 0) + 
      (term.names?.length || 0) + 
      (term.aliases?.length || 0) + 
      (term.abbr?.length || 0);
  }, 0);

  console.log(`Total patterns: ${patternCount}`);
}

bundleTerms().catch(console.error);
