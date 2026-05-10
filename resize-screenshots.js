/**
 * Resize App Store screenshots from 6.9" (iPhone 17 Max) to 6.5" format
 * Required by App Store Connect: 1284 × 2778px
 *
 * Usage:
 *   1. Put your screenshots in a folder (default: Screenshots/6.9 next to this file)
 *   2. Run: node resize-screenshots.js
 *   3. Resized files appear in Screenshots/6.5
 */

const sharp = require("sharp");
const path  = require("path");
const fs    = require("fs");

const INPUT_DIR  = path.join(__dirname, "Screenshots", "6.9");
const OUTPUT_DIR = path.join(__dirname, "Screenshots", "6.5");
const TARGET_W   = 1284;
const TARGET_H   = 2778;

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const files = fs.readdirSync(INPUT_DIR).filter(f => /\.(png|jpg|jpeg)$/i.test(f));

if (files.length === 0) {
  console.log(`No images found in ${INPUT_DIR}`);
  console.log("Put your 6.9\" screenshots there and re-run.");
  process.exit(1);
}

(async () => {
  for (const file of files) {
    const src  = path.join(INPUT_DIR, file);
    const dest = path.join(OUTPUT_DIR, file.replace(/\.(jpg|jpeg)$/i, ".png"));
    await sharp(src)
      .resize(TARGET_W, TARGET_H, { fit: "cover", position: "top" })
      .png()
      .toFile(dest);
    console.log(`✓  ${file}  →  ${TARGET_W}×${TARGET_H}`);
  }
  console.log(`\nResized screenshots saved to: ${OUTPUT_DIR}`);
})();
