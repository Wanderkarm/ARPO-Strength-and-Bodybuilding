/**
 * POWRLOG Icon Generator
 * Source: powrlog3.jpeg (4000×4000, black background)
 * Run: node generate-icons.js
 */

const sharp = require("sharp");
const path  = require("path");
const fs    = require("fs");

// Full logo (barbell + text) — used for splash screen and in-app display
const LOGO_JPEG = path.join(__dirname, "powrlog3.jpeg");

// Bar chart SVG — used for the app icon (reads clean at small sizes)
const ICON_SVG  = path.join(__dirname, "ARPO.svg");
const OUT = path.join(__dirname, "App", "assets", "images");

const svgBuf = fs.readFileSync(ICON_SVG);

// Android adaptive background: solid black
const androidBgSvg = Buffer.from(
  `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" fill="#000000"/>
  </svg>`
);

// Android monochrome: white bar chart on black
const monoSvg = Buffer.from(
  `<svg viewBox="0 0 1201.5 1210.5" xmlns="http://www.w3.org/2000/svg">
    <rect width="1201.5" height="1210.5" fill="black"/>
    <rect x="120" y="478" width="147" height="116" rx="10" fill="white"/>
    <rect x="306" y="362" width="138" height="232" rx="10" fill="white"/>
    <rect x="470" y="150" width="130" height="444" rx="10" fill="white"/>
    <rect x="640" y="48"  width="125" height="542" rx="10" fill="white"/>
    <rect x="640" y="544" width="494" height="50"  rx="10" fill="white"/>
  </svg>`
);

const jobs = [
  // App icon — bar chart SVG (crisp at every size)
  { file: "icon.png",                    buf: svgBuf,        size: 1024 },
  // Splash — full barbell logo JPEG (shown large on launch screen)
  { file: "splash-icon.png",             filePath: LOGO_JPEG, size: 1024 },
  // Android adaptive
  { file: "android-icon-foreground.png", buf: svgBuf,        size: 1024 },
  { file: "android-icon-background.png", buf: androidBgSvg,  size: 1024 },
  { file: "android-icon-monochrome.png", buf: monoSvg,       size: 1024 },
  // Favicon — bar chart SVG
  { file: "favicon.png",                 buf: svgBuf,        size: 196  },
];

(async () => {
  for (const { file, filePath, buf, size, mono } of jobs) {
    const dest = path.join(OUT, file);

    // Source is either a Buffer (inline SVG) or a file path
    let pipeline = buf ? sharp(buf) : sharp(filePath);

    // Resize — source is already square so "contain" = straight downscale
    pipeline = pipeline.resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0 },
    });

    // Monochrome: greyscale + threshold → pure white/black for themed Android icons
    if (mono) {
      pipeline = pipeline.greyscale().threshold(80);
    }

    await pipeline.png().toFile(dest);
    console.log(`✓  ${file}  (${size}×${size})`);
  }
  console.log("\nAll icons written to App/assets/images/");
})();
