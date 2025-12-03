/**
 * PWA Icon Generator for The GRACE Bible
 * Run with: node generate-icons.js
 * Requires: npm install canvas
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// Icon design constants
const BACKGROUND_COLOR = '#1A1A1A';
const GOLD_COLOR = '#C9A227';
const CORNER_RADIUS_RATIO = 0.125; // 12.5% of size

function drawIcon(ctx, size, isMaskable = false) {
    const cornerRadius = size * CORNER_RADIUS_RATIO;
    
    // For maskable icons, use safe zone (80% center)
    const safeZone = isMaskable ? 0.1 : 0;
    const offset = size * safeZone;
    const innerSize = size - (offset * 2);
    
    // Background with rounded corners
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, cornerRadius);
    ctx.fill();
    
    // Calculate font size and positions within safe zone
    const fontSize = innerSize * 0.47;
    const letterY = offset + (innerSize * 0.62);
    const lineY = offset + (innerSize * 0.74);
    const lineWidth = innerSize * 0.625;
    const lineHeight = size * 0.008;
    
    // Gold "G" letter
    ctx.fillStyle = GOLD_COLOR;
    ctx.font = `bold ${fontSize}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('G', size / 2, letterY);
    
    // Gold accent line
    ctx.fillRect(
        (size - lineWidth) / 2,
        lineY,
        lineWidth,
        Math.max(lineHeight, 2)
    );
}

function generateIcon(size, filename, isMaskable = false) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    drawIcon(ctx, size, isMaskable);
    
    const buffer = canvas.toBuffer('image/png');
    const filepath = path.join(__dirname, 'icons', filename);
    fs.writeFileSync(filepath, buffer);
    console.log(`Generated: ${filename} (${size}x${size})`);
}

// Ensure icons directory exists
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate all required icons
console.log('Generating PWA icons...\n');

// Standard icons
generateIcon(192, 'icon-192.png');
generateIcon(512, 'icon-512.png');
generateIcon(180, 'icon-180.png');  // iOS
generateIcon(32, 'favicon-32.png');

// Maskable icons (with safe zone for Android adaptive icons)
generateIcon(192, 'icon-maskable-192.png', true);
generateIcon(512, 'icon-maskable-512.png', true);

console.log('\nAll icons generated successfully!');
console.log('Note: If you don\'t have canvas installed, run: npm install canvas');

