import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

type PackageJson = {
	name: string;
	"workers-sdk": {
		prerelease: boolean;
	};
};

type Package = {
	path: string;
	json: PackageJson;
};

function getPackagePaths(): string[] {
	const stdout = execSync(
		'pnpm list --filter="./packages/*" --recursive --depth=-1 --parseable',
		{ cwd: projectRoot, encoding: "utf8" }
	);
	return stdout.split("\n").filter((pkgPath) => path.isAbsolute(pkgPath));
}

function getPackage(pkgPath: string): Package {
	const json = fs.readFileSync(path.join(pkgPath, "package.json"), "utf8");
	return {
		path: pkgPath,
		json: JSON.parse(json),
	};
}

function getPackages() {
	return getPackagePaths().map(getPackage);
}

export function getPackagesForPrerelease() {
	return getPackages().filter((pkg) => pkg.json["workers-sdk"]?.prerelease);
}

{
	const pkgs = getPackagesForPrerelease();

	spawnSync(
		"pnpm",
		[
			"dlx",
			"pkg-pr-new",
			"publish",
			"--pnpm",
			"--compact",
			"--no-template",
			...pkgs.map((pkg) => pkg.path),
		],
		{
			stdio: "inherit",
		}
	);
}
