#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [version] = process.argv.slice(2);
const versionPattern = /^(\d{4})\.(\d{1,2})\.(\d+)$/;
const match = version?.match(versionPattern);
const month = match ? Number(match[2]) : Number.NaN;
const sequence = match ? Number(match[3]) : Number.NaN;

if (!match || month < 1 || month > 12 || sequence < 1) {
  console.error(
    "Use calendar version YYYY.M.N, for example: npm run release:prepare -- 2026.7.1",
  );
  process.exit(64);
}

const root = process.cwd();
const packagePath = resolve(root, "package.json");
const webPackagePath = resolve(root, "apps/web/package.json");
const lockPath = resolve(root, "package-lock.json");
const changelogPath = resolve(root, "CHANGELOG.md");
const [packageSource, webPackageSource, lockSource, changelog] =
  await Promise.all([
    readFile(packagePath, "utf8"),
    readFile(webPackagePath, "utf8"),
    readFile(lockPath, "utf8"),
    readFile(changelogPath, "utf8"),
  ]);

const releaseHeader = new RegExp(
  `^## \\[${version.replaceAll(".", "\\.")}\\]`,
  "m",
);
if (releaseHeader.test(changelog)) {
  console.error(`CHANGELOG.md already contains ${version}.`);
  process.exit(65);
}

const unreleasedHeader = "## [Unreleased]";
const unreleasedStart = changelog.indexOf(unreleasedHeader);
if (unreleasedStart === -1) {
  console.error(
    "CHANGELOG.md must begin its pending notes with ## [Unreleased].",
  );
  process.exit(65);
}

const notesStart = unreleasedStart + unreleasedHeader.length;
const nextRelease = changelog.indexOf("\n## [", notesStart);
const notes = changelog
  .slice(notesStart, nextRelease === -1 ? undefined : nextRelease)
  .trim();
if (!/^[-*] .+/m.test(notes)) {
  console.error(
    "Add at least one bullet under ## [Unreleased] before preparing a release.",
  );
  process.exit(65);
}

const now = new Date();
const date = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
].join("-");
const releaseBlock = `## [${version}] - ${date}\n\n${notes}\n\n`;
const updatedChangelog =
  changelog.slice(0, notesStart) +
  "\n\n" +
  releaseBlock +
  (nextRelease === -1 ? "" : changelog.slice(nextRelease + 1));

const packageJson = JSON.parse(packageSource);
const webPackageJson = JSON.parse(webPackageSource);
const packageLock = JSON.parse(lockSource);
packageJson.version = version;
webPackageJson.version = version;
packageLock.version = version;
packageLock.packages[""].version = version;
packageLock.packages["apps/web"].version = version;

await Promise.all([
  writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`),
  writeFile(webPackagePath, `${JSON.stringify(webPackageJson, null, 2)}\n`),
  writeFile(lockPath, `${JSON.stringify(packageLock, null, 2)}\n`),
  writeFile(changelogPath, updatedChangelog),
]);

console.log(
  `Prepared Currentfold ${version}. Review the changelog, then commit and tag v${version}.`,
);
