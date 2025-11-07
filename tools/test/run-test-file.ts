import { spawn } from "child_process";
import { findUpSync } from "find-up";
import fs from "fs";
import path from "path";

const currentFile = process.argv[2];
const currentDirectory = path.dirname(currentFile);

const packageJsonPath = findUpSync("package.json", { cwd: currentDirectory });

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
