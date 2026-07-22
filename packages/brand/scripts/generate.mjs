import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = JSON.parse(
  await readFile(join(packageRoot, "tokens.json"), "utf8"),
);
const checkOnly = process.argv.includes("--check");

const color = (name) => tokens.color[name].$value;
const font = (name) => tokens.font.family[name].$value;

const css = `/* Generated from packages/brand/tokens.json. Do not edit directly. */
:root {
  --currentfold-color-paper: ${color("paper").hex};
  --currentfold-color-ink: ${color("ink").hex};
  --currentfold-color-current: ${color("current").hex};
  --currentfold-color-stone: ${color("stone").hex};
  --currentfold-color-deep-ink: ${color("deepInk").hex};
  --currentfold-font-editorial: "${font("editorial")}", ui-serif, Georgia, serif;
  --currentfold-font-interface: "${font("interface")}", ui-sans-serif, system-ui, sans-serif;
}
`;

const swiftColor = (name) => {
  const [red, green, blue] = color(name).components;
  return `Color(.sRGB, red: ${red}, green: ${green}, blue: ${blue}, opacity: 1)`;
};

const swift = `// Generated from packages/brand/tokens.json. Do not edit directly.
import SwiftUI

public enum CurrentfoldBrand {
    public static let paper = ${swiftColor("paper")}
    public static let ink = ${swiftColor("ink")}
    public static let current = ${swiftColor("current")}
    public static let stone = ${swiftColor("stone")}
    public static let deepInk = ${swiftColor("deepInk")}

    public static let editorialFontFamily = "${font("editorial")}"
    public static let interfaceFontFamily = "${font("interface")}"
}
`;

const assetContents = `${JSON.stringify(
  {
    images: [
      {
        filename: "currentfold-mark.svg",
        idiom: "universal",
      },
      {
        appearances: [{ appearance: "luminosity", value: "dark" }],
        filename: "currentfold-mark-reversed.svg",
        idiom: "universal",
      },
    ],
    info: { author: "xcode", version: 1 },
    properties: { "preserves-vector-representation": true },
  },
  null,
  2,
)}\n`;

const assetCatalogContents = `${JSON.stringify(
  { info: { author: "xcode", version: 1 } },
  null,
  2,
)}\n`;

const primaryMark = await readFile(
  join(packageRoot, "assets/currentfold-mark.svg"),
  "utf8",
);
const reversedMark = await readFile(
  join(packageRoot, "assets/currentfold-mark-reversed.svg"),
  "utf8",
);
const appIconSource = await readFile(
  join(packageRoot, "assets/currentfold-app-icon.svg"),
);
const appIcon = await sharp(appIconSource)
  .resize(1024, 1024)
  .flatten({ background: color("deepInk").hex })
  .png()
  .toBuffer();

const appIconContents = `${JSON.stringify(
  {
    images: [
      {
        filename: "CurrentfoldAppIcon.png",
        idiom: "universal",
        platform: "ios",
        size: "1024x1024",
      },
    ],
    info: { author: "xcode", version: 1 },
  },
  null,
  2,
)}\n`;

const outputs = new Map([
  ["dist/currentfold.css", css],
  ["ios/Sources/CurrentfoldBrand/BrandTokens.generated.swift", swift],
  [
    "ios/Sources/CurrentfoldBrand/Resources/Media.xcassets/Contents.json",
    assetCatalogContents,
  ],
  [
    "ios/Sources/CurrentfoldBrand/Resources/Media.xcassets/CurrentfoldMark.imageset/Contents.json",
    assetContents,
  ],
  [
    "ios/Sources/CurrentfoldBrand/Resources/Media.xcassets/CurrentfoldMark.imageset/currentfold-mark.svg",
    primaryMark,
  ],
  [
    "ios/Sources/CurrentfoldBrand/Resources/Media.xcassets/CurrentfoldMark.imageset/currentfold-mark-reversed.svg",
    reversedMark,
  ],
  ["ios/AppAssets.xcassets/Contents.json", assetCatalogContents],
  ["ios/AppAssets.xcassets/AppIcon.appiconset/Contents.json", appIconContents],
  ["ios/AppAssets.xcassets/AppIcon.appiconset/CurrentfoldAppIcon.png", appIcon],
]);

const stale = [];

for (const [relativePath, expected] of outputs) {
  const path = join(packageRoot, relativePath);
  const expectedBuffer = Buffer.isBuffer(expected)
    ? expected
    : Buffer.from(expected);

  if (checkOnly) {
    const actual = await readFile(path).catch(() => null);
    if (!actual?.equals(expectedBuffer)) stale.push(relativePath);
    continue;
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, expectedBuffer);
}

if (stale.length > 0) {
  console.error(
    `Generated brand output is stale:\n${stale.map((path) => `- ${path}`).join("\n")}\nRun npm run brand:generate.`,
  );
  process.exitCode = 1;
} else if (!checkOnly) {
  console.log(`Generated ${outputs.size} Currentfold brand outputs.`);
}
