import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const currentFile = process.argv[2];
const packageJsonPath = findNearestPackageJson(currentFile);

if (!packageJsonPath) {
	console.error("No package.json found.");
	process.exit(1);
}

const packageJsonContent = fs.readFileSync(packageJsonPath, "utf8");
const packageJson = JSON.parse(packageJsonContent);
const packageName = packageJson.name;

const command = `pnpm`;
const args = ["test", "-F", packageName, "--", currentFile];

const testProcess = spawn(command, args, { stdio: "inherit" });

testProcess.on("close", (code) => {
	process.exit(code ?? 1);
});

/**
 * Finds the nearest parent package.json to the provided file.
 */
function findNearestPackageJson(file: string) {
	let dir = path.dirname(file);

	while (dir !== path.resolve(dir, "..")) {
		const jsonPath = path.join(dir, "package.json");
		if (fs.existsSync(jsonPath)) {
			return jsonPath;
		}
		dir = path.resolve(dir, "..");
	}
	return null;
}
