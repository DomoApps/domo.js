#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEMO_DIR = __dirname;
const PUBLIC_ASSETS_DIR = path.join(DEMO_DIR, 'public-assets');
const INDEX_HTML = path.join(DEMO_DIR, 'index.html');

// Check if public-assets exists
function hasPublicAssets() {
  return fs.existsSync(PUBLIC_ASSETS_DIR);
}

// Remove public-assets directory
function removePublicAssetsDir() {
  if (fs.existsSync(PUBLIC_ASSETS_DIR)) {
    console.log('Removing public-assets directory...');
    fs.rmSync(PUBLIC_ASSETS_DIR, { recursive: true, force: true });
    console.log('✓ Removed public-assets directory');
  }
}

// Restore original paths in index.html
function restoreIndexHtml() {
  if (!fs.existsSync(INDEX_HTML)) {
    console.log('⚠ index.html not found');
    return;
  }

  let html = fs.readFileSync(INDEX_HTML, 'utf8');

  // Restore original paths
  const replacements = [
    { from: 'href="public-assets/assets/', to: 'href="assets/' },
    { from: 'src="public-assets/domo.js"', to: 'src="domo.js"' },
    { from: 'src="public-assets/assets/', to: 'src="assets/' }
  ];

  for (const { from, to } of replacements) {
    const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    html = html.replace(regex, to);
  }

  fs.writeFileSync(INDEX_HTML, html);
  console.log('✓ Restored index.html paths');
}

// Main clean function
function clean() {
  console.log('🧹 Cleaning demo build...\n');

  try {
    if (!hasPublicAssets()) {
      console.log('⚠ No public-assets directory found. Already clean!');
      console.log('\n✅ Already clean!');
      return;
    }

    restoreIndexHtml();
    removePublicAssetsDir();
    console.log('\n✅ Clean complete! Restored index.html and removed public-assets/');
  } catch (error) {
    console.error('\n❌ Clean failed:', error.message);
    process.exit(1);
  }
}

// Run clean
clean();
