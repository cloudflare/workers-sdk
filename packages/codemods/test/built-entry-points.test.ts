import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const directories: string[] = [];
// Allow for cold Node starts on Windows while keeping other platforms' timeout unchanged.
const subprocessTimeout = process.platform === "win32" ? 30_000 : 10_000;

afterEach(() => {
	for (const directory of directories.splice(0)) {
		removeDirSync(directory);
	}
});

/** Copy the built package outside the workspace so missing chunks cannot resolve locally. */
function createConsumer(): string {
	const directory = mkdtempSync(path.join(tmpdir(), "codemods-built-"));
	directories.push(directory);
	cpSync(path.join(packageRoot, "dist"), path.join(directory, "dist"), {
		recursive: true,
	});
	cpSync(
		path.join(packageRoot, "package.json"),
		path.join(directory, "package.json")
	);
	writeFileSync(
		path.join(directory, "vitest.config.ts"),
		`import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
export default defineWorkersConfig({ test: { poolOptions: { workers: {} } } });`
	);
	return directory;
}

it(
	"runs migrations through the built library without running the CLI",
	({ expect }) => {
		const cwd = createConsumer();
		const entry = pathToFileURL(path.join(cwd, "dist/index.mjs")).href;
		const output = execFileSync(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				`const api = await import(${JSON.stringify(entry)});
await api.runCodemod("vitest:v3-to-v4", { cwd: process.cwd(), dryRun: false, force: true });
console.log(typeof api.migrateWranglerToCf);`,
			],
			{ cwd, encoding: "utf8", timeout: subprocessTimeout }
		);
		expect(output.trim()).toBe("function");
		expect(readFileSync(path.join(cwd, "vitest.config.ts"), "utf8")).toContain(
			"cloudflareTest"
		);
	},
	subprocessTimeout + 5_000
);

it(
	"runs migrations through the built CLI with its shared chunks",
	({ expect }) => {
		const cwd = createConsumer();
		const output = execFileSync(
			process.execPath,
			[path.join(cwd, "dist/bin.mjs"), "vitest:v3-to-v4", "--force"],
			{ cwd, encoding: "utf8", timeout: subprocessTimeout }
		);
		expect(output).toContain("vitest:v3-to-v4: 1 file(s)");
		expect(readFileSync(path.join(cwd, "vitest.config.ts"), "utf8")).toContain(
			"cloudflareTest"
		);
	},
	subprocessTimeout + 5_000
);
