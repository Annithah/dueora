#!/usr/bin/env node
/**
 * Render the DueOra brand mark (src/components/ui/Logo.tsx) into the app's icon and
 * splash PNGs. Run: node scripts/generate-icons.mjs
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { Resvg } from '@resvg/resvg-js';

const TEAL = '#0F5C5C';
const AMBER = '#F2A33A';
const out = (f) => path.join(import.meta.dirname, '..', 'assets', f);

/** The mark in a 48×48 box: open ring, amber check, amber dot. */
function mark(ring, check = AMBER, dot = AMBER) {
  return `<path d="M37 30.5A15 15 0 1 1 36.5 17" stroke="${ring}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <path d="m18 24 5 5 9-10" stroke="${check}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="37" cy="10" r="3.5" fill="${dot}"/>`;
}

/** `scale` = share of the canvas the 48-unit mark occupies. */
function svg(size, { background, ring, check, dot, scale }) {
  const box = size * scale;
  const offset = (size - box) / 2;
  const k = box / 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : ''}
    <g transform="translate(${offset} ${offset}) scale(${k})">${mark(ring, check, dot)}</g>
  </svg>`;
}

function render(file, size, opts) {
  const png = new Resvg(svg(size, opts), { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(out(file), png);
  console.log(`${file} ${size}×${size}`);
}

// iOS / store icon: full-bleed teal, no transparency.
render('icon.png', 1024, { background: TEAL, ring: '#FFFFFF', scale: 0.62 });
// Android adaptive icon: mark inside the 66% safe zone on a separate teal layer.
render('android-icon-foreground.png', 1024, { ring: '#FFFFFF', scale: 0.46 });
render('android-icon-background.png', 1024, { background: TEAL, ring: TEAL, check: TEAL, dot: TEAL, scale: 0.01 });
// Monochrome (Android 13 themed icons) and the status-bar notification icon: white only.
render('android-icon-monochrome.png', 1024, { ring: '#FFFFFF', check: '#FFFFFF', dot: '#FFFFFF', scale: 0.46 });
// Splash: white mark on the teal splash background set in app.json.
render('splash-icon.png', 1024, { ring: '#FFFFFF', scale: 0.7 });
render('favicon.png', 48, { background: TEAL, ring: '#FFFFFF', scale: 0.8 });
