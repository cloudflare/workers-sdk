import fs from "node:fs";
import type { CoreProperties as PackageJson } from "@schemastore/package";

export function writePackageJson(packageJson: PackageJson = {}) {
	fs.writeFileSync("package.json", JSON.stringify(packageJson));
}
