import childProcess from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function* walkTsConfigs(rootPath) {
	for (const entry of await fs.readdir(rootPath, { withFileTypes: true })) {
		if (entry.name === "node_modules") continue;
		const filePath = path.join(rootPath, entry.name);
		if (entry.isDirectory()) yield* walkTsConfigs(filePath);
		else if (entry.name === "tsconfig.json") yield filePath;
	}
}

for await (const tsconfigPath of walkTsConfigs(__dirname)) {
	console.log(`Checking ${path.relative(__dirname, tsconfigPath)}...`);
	const result = childProcess.spawnSync(
		"node_modules/.bin/tsc",
		["-p", tsconfigPath],
		{ stdio: "inherit", cwd: __dirname, shell: true }
	);
	if (result.status !== 0) process.exitCode = 1;
}
