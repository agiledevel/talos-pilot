import { prepareAppImagePackageReference } from "./lib/appimage-package-reference.ts";

/** Creates an authenticated-package data reference without installing packages. */
const args = process.argv.slice(2);
const root = args[1];
const directory = args[3];
if (
  args.length !== 4 ||
  args[0] !== "--root" ||
  args[2] !== "--directory" ||
  root === undefined ||
  root === "" ||
  root.startsWith("--") ||
  directory === undefined ||
  directory === "" ||
  directory.startsWith("--")
) {
  throw new Error(
    "Usage: node scripts/prepare-appimage-reference.ts --root <extracted-AppImage> --directory <new-private-directory>",
  );
}
const summary = prepareAppImagePackageReference(root, directory);
console.info(
  `Prepared Ubuntu package data reference: ${summary.files} files, ${summary.bytes} bytes, ${summary.packages} packages.`,
);
