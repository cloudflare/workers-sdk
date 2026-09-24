import {
	mkdtemp,
	readFile,
	readdir,
	rmdir,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "vitest";
import { migrateWranglerToCf } from "../../src";
import { getSyntaxErrors } from "./test-helpers";

const temporaryDirectories: string[] = [];

async function createProject(files: Record<string, string>): Promise<string> {
	const directory = await mkdtemp(path.join(tmpdir(), "wrangler-to-cf-"));

	temporaryDirectories.push(directory);

	for (const [filePath, contents] of Object.entries(files)) {
		await writeFile(path.join(directory, filePath), contents);
	}

	return directory;
}

async function removeDirectory(directory: string): Promise<void> {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);

		if (entry.isDirectory()) {
			await removeDirectory(entryPath);
			continue;
		}

		await unlink(entryPath);
	}
	await rmdir(directory);
}

afterEach(async () => {
	for (const directory of temporaryDirectories.splice(0)) {
		await removeDirectory(directory);
	}
});

describe("migrateWranglerToCf", () => {
	it("writes a complete Vite config with optional options omitted", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"wrangler.jsonc": `{
				// Core Worker configuration
				"name": "example-worker",
				"account_id": "account-id",
				"compatibility_date": "2026-09-23",
				"main": "src/index.ts",

				"kv_namespaces": [{ "binding": "CACHE", "id": "abc" }],
				"routes": ["example.com/*"],
				"secrets": { "required": ["API_TOKEN"] },
				"triggers": { "crons": ["0 * * * *"] },
				"vars": { "TEXT": "value", "JSON": { "enabled": true } }
			}`,
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.jsonc"));
		const output = await readFile(
			path.join(cwd, "cloudflare.config.ts"),
			"utf8"
		);

		expect(result).toMatchObject({
			changedFiles: ["cloudflare.config.ts"],
			followUps: [],
			status: "complete",
		});
		expect(output).toMatchSnapshot("cloudflare.config.ts");
		expect(output).toContain('from "cf/config"');
		expect(output).toContain('accountId: "account-id"');
		expect(output).toContain('name: "example-worker"');
		expect(output).toContain('compatibilityDate: "2026-09-23"');
		expect(output).not.toContain("complianceRegion");
		expect(output).toContain('entrypoint: "src/index.ts"');
		expect(output).toContain('TEXT: bindings.text("value")');
		expect(output).toContain("JSON: bindings.json({");
		expect(output).toContain("API_TOKEN: bindings.secret()");
		expect(output).toContain("CACHE: bindings.kv({");
		expect(output).toContain("triggers.fetch({");
		expect(output).toContain("triggers.scheduled({");
		expect(output).not.toContain("Migration incomplete");
		expect(getSyntaxErrors(output)).toEqual([]);
		await expect(
			readFile(path.join(cwd, "wrangler.config.ts"), "utf8")
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("migrates environments, compliance, previews, and warns without reading secret files", async ({
		expect,
	}) => {
		const cwd = await createProject({
			".env.example": "SHOULD_NOT_APPEAR=super-secret-value",
			"wrangler.json": JSON.stringify({
				name: "example-worker",
				compatibility_date: "2026-09-23",
				env: {
					staging: {
						compliance_region: "fedramp_high",
						previews: { vars: { PREVIEW: "yes" } },
						vars: { MODE: "staging" },
					},
				},
			}),
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"));
		const output = await readFile(
			path.join(cwd, "cloudflare.config.ts"),
			"utf8"
		);

		expect(result.status).toBe("needs-intervention");
		expect(result.followUps.map(({ code }) => code)).toEqual(
			expect.arrayContaining([
				"environments-migrated",
				"preview-review",
				"secret-files-not-migrated",
			])
		);
		expect(output).toMatchSnapshot("cloudflare.config.ts");
		expect(output).toContain("switch (ctx.mode)");
		expect(output).toContain('case "staging"');
		expect(output).toContain('name: "example-worker-staging"');
		expect(output).toContain('complianceRegion: "fedramp-high"');
		expect(output).toContain("if (ctx.isPreview)");
		expect(output).toContain("Migration incomplete");
		expect(output).toContain(".env.example");
		expect(output).not.toContain("super-secret-value");
		expect(output).toContain(
			"https://developers.cloudflare.com/workers/wrangler/environments/"
		);
		expect(getSyntaxErrors(output)).toEqual([]);
	});

	it("writes Wrangler tooling config only when requested and needed", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"wrangler.jsonc": JSON.stringify({
				assets: {
					directory: "public",
					html_handling: "auto-trailing-slash",
				},
				compatibility_date: "2026-09-23",
				dev: {
					port: 9000,
				},
				name: "example-worker",
				no_bundle: true,
				rules: [
					{
						globs: ["**/*.txt"],
						type: "Text",
					},
				],
			}),
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.jsonc"), {
			bundler: "wrangler",
		});
		const cloudflareConfig = await readFile(
			path.join(cwd, "cloudflare.config.ts"),
			"utf8"
		);
		const wranglerConfig = await readFile(
			path.join(cwd, "wrangler.config.ts"),
			"utf8"
		);

		expect(result).toMatchObject({
			changedFiles: ["cloudflare.config.ts", "wrangler.config.ts"],
			status: "complete",
		});
		expect(cloudflareConfig).toMatchSnapshot("cloudflare.config.ts");
		expect(wranglerConfig).toMatchSnapshot("wrangler.config.ts");
		expect(cloudflareConfig).toContain('htmlHandling: "auto-trailing-slash"');
		expect(cloudflareConfig).not.toContain("assetsDirectory");
		expect(wranglerConfig).toContain('from "wrangler/experimental-config"');
		expect(wranglerConfig).toContain('assetsDirectory: "public"');
		expect(wranglerConfig).toContain("noBundle: true");
		expect(wranglerConfig).toContain("port: 9000");
		expect(wranglerConfig).toContain("rules: [");
		expect(getSyntaxErrors(cloudflareConfig)).toEqual([]);
		expect(getSyntaxErrors(wranglerConfig)).toEqual([]);
	});

	it("does not create `wrangler.config.ts` for the Vite bundler", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				dev: {
					port: 9000,
				},
				name: "example-worker",
				rules: [
					{
						globs: ["**/*.txt"],
						type: "Text",
					},
				],
			}),
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"));
		const cloudflareConfig = await readFile(
			path.join(cwd, "cloudflare.config.ts"),
			"utf8"
		);

		expect(result.status).toBe("needs-intervention");
		expect(result.followUps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "vite-tooling-config" }),
			])
		);
		expect(cloudflareConfig).toMatchSnapshot("cloudflare.config.ts");
		expect(cloudflareConfig).toContain("Wrangler-specific tooling fields");
		await expect(
			readFile(path.join(cwd, "wrangler.config.ts"), "utf8")
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("leaves guarded TODOs for unsupported resource migrations", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"wrangler.toml": `name = "example-worker"
compatibility_date = "2026-09-23"

[[hyperdrive]]
binding = "DATABASE"
id = "hyperdrive-id"
localConnectionString = "postgres://user:secret@localhost/database"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Counter"]

[[durable_objects.bindings]]
name = "COUNTER"
class_name = "Counter"

[[workflows]]
binding = "FLOW"
name = "flow"
class_name = "Flow"

[[containers]]
name = "container"
image = "./Dockerfile"
`,
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.toml"));
		const output = await readFile(
			path.join(cwd, "cloudflare.config.ts"),
			"utf8"
		);

		expect(result.status).toBe("needs-intervention");
		expect(result.followUps.map(({ code }) => code)).toEqual(
			expect.arrayContaining([
				"container-review",
				"durable-object-migrations",
				"durable-object-review",
				"workflows-unsupported",
			])
		);
		expect(output).toMatchSnapshot("cloudflare.config.ts");
		expect(output).toContain("COUNTER: bindings.durableObject({");
		expect(output).toContain("exports.durableObject");
		expect(output).toContain("TODO(@cloudflare)");
		expect(output).toContain("Migration incomplete");
		expect(output).not.toContain("postgres://user:secret");
		expect(getSyntaxErrors(output)).toEqual([]);
	});

	it("does not write files during a dry run", async ({ expect }) => {
		const cwd = await createProject({
			"wrangler.toml": `name = "example-worker"
compatibility_date = "2026-09-23"
`,
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.toml"), {
			bundler: "wrangler",
			dryRun: true,
		});

		expect(result.changedFiles).toEqual(["cloudflare.config.ts"]);
		await expect(
			readFile(path.join(cwd, "cloudflare.config.ts"), "utf8")
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("never overwrites an existing cloudflare.config.ts, even with force", async ({
		expect,
	}) => {
		const existing = "export default {};\n";
		const cwd = await createProject({
			"cloudflare.config.ts": existing,
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
			}),
		});

		await expect(
			migrateWranglerToCf(path.join(cwd, "wrangler.json"), { force: true })
		).rejects.toThrow("already exists");
		expect(await readFile(path.join(cwd, "cloudflare.config.ts"), "utf8")).toBe(
			existing
		);
	});
});
