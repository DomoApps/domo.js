#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEMO_DIR = __dirname;
const PUBLIC_ASSETS_DIR = path.join(DEMO_DIR, 'public-assets');
const INDEX_HTML = path.join(DEMO_DIR, 'index.html');

// Files and directories to move to public-assets/
const ITEMS_TO_MOVE = [
  'assets',
  'domo.js',
  'manifest.json',
  'README.md',
  'thumbnail.png'
];

// Create public-assets directory
function createPublicAssetsDir() {
  if (fs.existsSync(PUBLIC_ASSETS_DIR)) {
    console.log('Cleaning existing public-assets directory...');
    fs.rmSync(PUBLIC_ASSETS_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(PUBLIC_ASSETS_DIR, { recursive: true });
  console.log('✓ Created public-assets directory');
}

// Copy file or directory recursively
function copyRecursive(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src);

    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      copyRecursive(srcPath, destPath);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Copy items to public-assets
function copyItems() {
  for (const item of ITEMS_TO_MOVE) {
    const srcPath = path.join(DEMO_DIR, item);

    if (fs.existsSync(srcPath)) {
      const destPath = path.join(PUBLIC_ASSETS_DIR, item);
      console.log(`Copying ${item}...`);
      copyRecursive(srcPath, destPath);
      console.log(`✓ Copied ${item} to public-assets/`);
    } else {
      console.log(`⚠ Skipping ${item} (not found)`);
    }
  }
}

// Update paths in index.html
function updateIndexHtml() {
  let html = fs.readFileSync(INDEX_HTML, 'utf8');

  // Update asset paths
  const replacements = [
    { from: 'href="assets/', to: 'href="public-assets/assets/' },
    { from: 'src="domo.js"', to: 'src="public-assets/domo.js"' },
    { from: 'src="assets/', to: 'src="public-assets/assets/' }
  ];

  for (const { from, to } of replacements) {
    const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    html = html.replace(regex, to);
  }

  fs.writeFileSync(INDEX_HTML, html);
  console.log('✓ Updated index.html with new paths');
}

// Main build function
function build() {
  console.log('🔨 Building demo...\n');

  try {
    createPublicAssetsDir();
    copyItems();
    updateIndexHtml();

    console.log('\n✅ Build complete! All assets copied to public-assets/');
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run build
build();
