/**
 * POWRLOG Icon Generator
 * Source: powrlog3.jpeg (4000×4000, black background)
 * Run: node generate-icons.js
 */

const sharp = require("sharp");
const path  = require("path");

const SRC = path.join(__dirname, "powrlog3.jpeg");
const OUT = path.join(__dirname, "App", "assets", "images");

// Android adaptive background: solid black to match logo background
const androidBgSvg = Buffer.from(
  `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" fill="#000000"/>
  </svg>`
);

const jobs = [
  // file                           source          size   mono?
  { file: "icon.png",                    filePath: SRC,        size: 1024 },
  { file: "splash-icon.png",             filePath: SRC,        size: 1024 },
  { file: "android-icon-foreground.png", filePath: SRC,        size: 1024 },
  { file: "android-icon-background.png", buf: androidBgSvg,    size: 1024 },
  { file: "android-icon-monochrome.png", filePath: SRC,        size: 1024, mono: true },
  { file: "favicon.png",                 filePath: SRC,        size: 196  },
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
