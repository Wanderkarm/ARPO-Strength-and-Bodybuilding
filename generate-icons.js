/**
 * ARPO Icon Generator
 * Uses the official ARPO (1).svg source file
 * Run: node generate-icons.js
 */

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const SVG_SRC = path.join(__dirname, "ARPO.svg");
const OUT     = path.join(__dirname, "App", "assets", "images");

const svgBuf = fs.readFileSync(SVG_SRC);

// Android background: solid red square (no artwork — system composites foreground on top)
const androidBgSvg = Buffer.from(
  `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" fill="#DC2626"/>
  </svg>`
);

// Android monochrome: white bars on black (for themed/tinted icons)
// Re-uses the main SVG but tinted — sharp can't do this easily, so use a
// hand-coded minimal SVG that mirrors the bar layout from the source.
const monoSvg = Buffer.from(
  `<svg viewBox="0 0 1201.5 1210.5" xmlns="http://www.w3.org/2000/svg">
    <rect width="1201.5" height="1210.5" fill="black"/>
    <!-- white bars (approx positions from source SVG) -->
    <rect x="120" y="478" width="147" height="116" rx="10" fill="white"/>
    <rect x="306" y="362" width="138" height="232" rx="10" fill="white"/>
    <rect x="470" y="150" width="130" height="444" rx="10" fill="white"/>
    <rect x="640" y="48"  width="125" height="542" rx="10" fill="white"/>
    <!-- crossbar -->
    <rect x="640" y="544" width="494" height="50"  rx="10" fill="white"/>
  </svg>`
);

const jobs = [
  { file: "icon.png",                    buf: svgBuf,      size: 1024 },
  { file: "splash-icon.png",             buf: svgBuf,      size: 1024 },
  { file: "android-icon-foreground.png", buf: svgBuf,      size: 1024 },
  { file: "android-icon-background.png", buf: androidBgSvg, size: 1024 },
  { file: "android-icon-monochrome.png", buf: monoSvg,     size: 1024 },
  { file: "favicon.png",                 buf: svgBuf,      size: 196  },
];

(async () => {
  for (const { file, buf, size } of jobs) {
    const dest = path.join(OUT, file);
    await sharp(buf)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(dest);
    console.log(`✓  ${file}  (${size}×${size})`);
  }
  console.log("\nAll icons written to App/assets/images/");
})();
