import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rmdir,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import { afterEach, describe, it, vi } from "vitest";
import { migrateWranglerToCf } from "../../src";
import { formatFollowUps } from "../../src/cli-output";
import { writeMigrationOutputs } from "../../src/codemods/wrangler-to-cf/file-writer";
import { getSyntaxErrors } from "./test-helpers";

const temporaryDirectories: string[] = [];

vi.mock("@cloudflare/cli-shared-helpers/packages", () => ({
	installPackages: vi.fn(),
}));

vi.mock(
	"../../src/codemods/wrangler-to-cf/file-writer",
	async (importOriginal) => {
		const original =
			await importOriginal<
				typeof import("../../src/codemods/wrangler-to-cf/file-writer")
			>();
		return {
			...original,
			writeMigrationOutputs: vi.fn(original.writeMigrationOutputs),
		};
	}
);

async function createProject(files: Record<string, string>): Promise<string> {
	const directory = await mkdtemp(path.join(tmpdir(), "wrangler-to-cf-"));

	temporaryDirectories.push(directory);

	for (const [filePath, contents] of Object.entries(files)) {
		const absolutePath = path.join(directory, filePath);
		await mkdir(path.dirname(absolutePath), { recursive: true });
		await writeFile(absolutePath, contents);
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
	vi.clearAllMocks();
	for (const directory of temporaryDirectories.splice(0)) {
		await removeDirectory(directory);
	}
});

describe("migrateWranglerToCf", () => {
	it("installs cf with the detected package manager", async ({ expect }) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({
				name: "example-worker",
				packageManager: "pnpm@10.27.0",
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
			}),
		});

		await migrateWranglerToCf(path.join(cwd, "wrangler.json"));

		expect(vi.mocked(installPackages)).toHaveBeenCalledWith(
			"pnpm",
			["cf@latest"],
			{
				cwd,
				dev: true,
				isWorkspaceRoot: false,
			}
		);
	});

	it("can skip installing cf programmatically", async ({ expect }) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({ name: "example-worker" }),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
			}),
		});

		await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			installDependencies: false,
		});

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
	});

	it("does not install cf when writing migration outputs fails", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({ name: "example-worker" }),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
			}),
		});
		vi.mocked(writeMigrationOutputs).mockRejectedValueOnce(
			new Error("write failed")
		);

		await expect(
			migrateWranglerToCf(path.join(cwd, "wrangler.json"))
		).rejects.toThrow("write failed");

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
	});

	it("keeps generated config and reports a failed cf installation", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({ name: "example-worker" }),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
			}),
		});
		vi.mocked(installPackages).mockRejectedValueOnce(
			new Error("Registry unavailable.")
		);

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"));

		expect(result).toMatchObject({
			changedFiles: ["cloudflare.config.ts"],
			followUps: [
				{
					blocking: true,
					code: "cf-install-failed",
				},
			],
			status: "needs-intervention",
		});
		expect(formatFollowUps(result.followUps)).toContain(
			"  - [required] The generated configuration was written, but `cf` could not be installed automatically. Install `cf@latest` as a dev dependency with your package manager before using it. Installation failed: Registry unavailable."
		);
		await expect(
			readFile(path.join(cwd, "cloudflare.config.ts"), "utf8")
		).resolves.toContain('from "cf/config"');
	});

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

	it("blocks Vite environments that conflict with default modes", async ({
		expect,
	}) => {
		const source = JSON.stringify({
			compatibility_date: "2026-09-23",
			env: {
				development: { vars: { MODE: "development" } },
				production: { vars: { MODE: "production" } },
			},
			name: "example-worker",
		});
		const cwd = await createProject({
			"wrangler.json": source,
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"));
		const output = await readFile(
			path.join(cwd, "cloudflare.config.ts"),
			"utf8"
		);

		expect(result.status).toBe("needs-intervention");
		expect(
			result.followUps
				.filter(({ code }) => code === "vite-mode-environment-conflict")
				.map(({ sourcePath }) => sourcePath)
		).toEqual(["env.development", "env.production"]);
		expect(output).toContain("Migration incomplete");
		expect(output).toContain('case "development"');
		expect(output).toContain('case "production"');
		expect(output).toMatchSnapshot("cloudflare.config.ts");
		expect(getSyntaxErrors(output)).toEqual([]);

		const wranglerCwd = await createProject({ "wrangler.json": source });
		const wranglerResult = await migrateWranglerToCf(
			path.join(wranglerCwd, "wrangler.json"),
			{ bundler: "wrangler" }
		);
		expect(wranglerResult.status).toBe("complete");
		expect(wranglerResult.followUps).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "vite-mode-environment-conflict" }),
			])
		);
	});

	it("does not inherit non-inheritable bindings into previews", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				kv_namespaces: [{ binding: "CACHE", id: "production-cache" }],
				name: "example-worker",
				previews: {
					vars: { MODE: "preview" },
				},
			}),
		});

		await migrateWranglerToCf(path.join(cwd, "wrangler.json"));
		const output = await readFile(
			path.join(cwd, "cloudflare.config.ts"),
			"utf8"
		);

		expect(output.match(/CACHE: bindings\.kv/g)).toHaveLength(1);
		expect(output).toMatchSnapshot("cloudflare.config.ts");
		expect(getSyntaxErrors(output)).toEqual([]);
	});

	it("inherits log forwarding bindings into environments and previews", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				env: {
					staging: {
						previews: { vars: { MODE: "preview" } },
					},
				},
				logfwdr: {
					bindings: [{ destination: "logs", name: "LOGS" }],
				},
				name: "example-worker",
			}),
		});

		await migrateWranglerToCf(path.join(cwd, "wrangler.json"));
		const output = await readFile(
			path.join(cwd, "cloudflare.config.ts"),
			"utf8"
		);

		expect(output.match(/LOGS: bindings\.logfwdr/g)).toHaveLength(3);
		expect(output).toMatchSnapshot("cloudflare.config.ts");
		expect(getSyntaxErrors(output)).toEqual([]);
	});

	it("preserves an explicitly empty email address list", async ({ expect }) => {
		const cwd = await createProject({
			"wrangler.json": JSON.stringify({
				addresses: [],
				compatibility_date: "2026-09-23",
				name: "example-worker",
			}),
		});

		await migrateWranglerToCf(path.join(cwd, "wrangler.json"));
		const output = await readFile(
			path.join(cwd, "cloudflare.config.ts"),
			"utf8"
		);

		expect(output).toContain("triggers.email({");
		expect(output).toContain("addresses: []");
		expect(output).toMatchSnapshot("cloudflare.config.ts");
		expect(getSyntaxErrors(output)).toEqual([]);
	});

	it("writes Wrangler tooling config only when requested and needed", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"node_modules/wrangler/package.json": JSON.stringify({
				name: "wrangler",
				version: "4.100.0",
			}),
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

	it("rejects Wrangler versions without experimental config support", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"node_modules/wrangler/package.json": JSON.stringify({
				name: "wrangler",
				version: "4.99.0",
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
		});

		await expect(
			migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
				bundler: "wrangler",
			})
		).rejects.toThrow("requires wrangler 4.100.0 or newer");
		await expect(
			readFile(path.join(cwd, "cloudflare.config.ts"), "utf8")
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("does not inherit base defines into named environment tooling", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"node_modules/wrangler/package.json": JSON.stringify({
				name: "wrangler",
				version: "4.100.0",
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				define: { BASE_ONLY: '"base"' },
				env: {
					staging: { vars: { MODE: "staging" } },
				},
				name: "example-worker",
			}),
		});

		await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			bundler: "wrangler",
		});
		const wranglerConfig = await readFile(
			path.join(cwd, "wrangler.config.ts"),
			"utf8"
		);

		expect(wranglerConfig.match(/BASE_ONLY/g)).toHaveLength(1);
		expect(wranglerConfig).toContain('case "staging"');
		expect(wranglerConfig).toMatchSnapshot("wrangler.config.ts");
		expect(getSyntaxErrors(wranglerConfig)).toEqual([]);
	});

	it("migrates preview-only Wrangler tooling without inheriting production defines", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"node_modules/wrangler/package.json": JSON.stringify({
				name: "wrangler",
				version: "4.100.0",
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				env: {
					staging: {
						define: { PRODUCTION_ONLY: '"production"' },
						previews: { vars: { MODE: "preview" } },
					},
				},
				name: "example-worker",
				previews: {
					define: { PREVIEW_ONLY: '"preview"' },
				},
			}),
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
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

		expect(result.changedFiles).toContain("wrangler.config.ts");
		expect(cloudflareConfig).toContain('MODE: bindings.text("preview")');
		expect(cloudflareConfig).toMatchSnapshot("cloudflare.config.ts");
		expect(wranglerConfig.match(/PRODUCTION_ONLY/g)).toHaveLength(1);
		expect(wranglerConfig.match(/PREVIEW_ONLY/g)).toHaveLength(1);
		expect(wranglerConfig).toMatchSnapshot("wrangler.config.ts");
		expect(getSyntaxErrors(cloudflareConfig)).toEqual([]);
		expect(getSyntaxErrors(wranglerConfig)).toEqual([]);
	});

	it("migrates each Worker in a multi-Worker project independently", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"workers/auth/wrangler.jsonc": JSON.stringify({
				compatibility_date: "2026-09-23",
				main: "src/index.ts",
				name: "auth-worker",
			}),
			"workers/entry/wrangler.jsonc": JSON.stringify({
				compatibility_date: "2026-09-23",
				main: "src/index.ts",
				name: "entry-worker",
				services: [
					{
						binding: "AUTH",
						service: "auth-worker",
					},
					{
						binding: "AUTH_ADMIN",
						entrypoint: "Admin",
						service: "auth-worker",
					},
				],
				tail_consumers: [{ service: "tail-worker" }],
			}),
		});
		const entryConfigPath = path.join(cwd, "workers/entry/wrangler.jsonc");
		const authConfigPath = path.join(cwd, "workers/auth/wrangler.jsonc");

		const [entryResult, authResult] = await Promise.all([
			migrateWranglerToCf(entryConfigPath),
			migrateWranglerToCf(authConfigPath),
		]);
		const [entryConfig, authConfig] = await Promise.all([
			readFile(path.join(cwd, "workers/entry/cloudflare.config.ts"), "utf8"),
			readFile(path.join(cwd, "workers/auth/cloudflare.config.ts"), "utf8"),
		]);

		expect(entryResult).toMatchObject({
			changedFiles: ["cloudflare.config.ts"],
			followUps: [],
			status: "complete",
		});
		expect(authResult).toMatchObject({
			changedFiles: ["cloudflare.config.ts"],
			followUps: [],
			status: "complete",
		});
		expect(entryConfig).toMatchSnapshot("entry/cloudflare.config.ts");
		expect(authConfig).toMatchSnapshot("auth/cloudflare.config.ts");
		expect(entryConfig).toContain(
			'AUTH: bindings.worker({\n\t\t\t\tworker: "auth-worker",'
		);
		expect(entryConfig).toContain('exportName: "Admin"');
		expect(entryConfig).toContain('worker: "tail-worker"');
		expect(getSyntaxErrors(entryConfig)).toEqual([]);
		expect(getSyntaxErrors(authConfig)).toEqual([]);
		await expect(
			readFile(path.join(cwd, "cloudflare.config.ts"), "utf8")
		).rejects.toMatchObject({ code: "ENOENT" });
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
				previews: {
					define: { PREVIEW_ONLY: '"preview"' },
				},
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
				expect.objectContaining({
					code: "vite-tooling-config",
					sourcePath: "previews.define",
				}),
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
