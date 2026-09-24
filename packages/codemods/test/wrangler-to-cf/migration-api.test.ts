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
import {
	rewriteMigrationOutput,
	writeMigrationOutputs,
} from "../../src/codemods/wrangler-to-cf/file-writer";

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
			rewriteMigrationOutput: vi.fn(original.rewriteMigrationOutput),
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
	it("rejects unsupported bundlers", async ({ expect }) => {
		await expect(
			migrateWranglerToCf("wrangler.json", {
				// @ts-expect-error Verifies runtime validation for JavaScript callers.
				bundler: "esbuild",
			})
		).rejects.toThrow(
			'Unsupported bundler "esbuild". Expected "vite" or "wrangler".'
		);
	});

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
		vi.mocked(installPackages).mockImplementationOnce(async () => {
			await writeFile(
				path.join(cwd, "package.json"),
				JSON.stringify({
					devDependencies: { cf: "latest" },
					name: "example-worker",
					packageManager: "pnpm@10.27.0",
				})
			);
			await writeFile(path.join(cwd, "pnpm-lock.yaml"), "lockfileVersion: 9");
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"));

		expect(vi.mocked(installPackages)).toHaveBeenCalledWith(
			"pnpm",
			["cf@latest"],
			{ cwd, dev: true, isWorkspaceRoot: false }
		);
		expect(result.changedFiles).toEqual([
			"cloudflare.config.ts",
			"package.json",
			"pnpm-lock.yaml",
		]);
	});

	it("reports planned dependency files during a dry run", async ({
		expect,
	}) => {
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

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			dryRun: true,
		});

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
		expect(result.changedFiles).toEqual([
			"cloudflare.config.ts",
			"package.json",
			"pnpm-lock.yaml",
		]);
	});

	it("reports the lockfile created by Bun", async ({ expect }) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({
				name: "example-worker",
				packageManager: "bun@1.2.0",
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
			}),
		});
		vi.mocked(installPackages).mockImplementationOnce(async () => {
			await writeFile(
				path.join(cwd, "package.json"),
				JSON.stringify({
					devDependencies: { cf: "latest" },
					name: "example-worker",
					packageManager: "bun@1.2.0",
				})
			);
			await writeFile(path.join(cwd, "bun.lock"), "lockfile");
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"));

		expect(result.changedFiles).toEqual([
			"cloudflare.config.ts",
			"package.json",
			"bun.lock",
		]);
	});

	it("skips dependency installation when requested", async ({ expect }) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({ name: "example-worker" }),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
			}),
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			installDependencies: false,
		});

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			followUps: [{ blocking: true, code: "cf-install-disabled" }],
			status: "needs-intervention",
		});
		await expect(
			readFile(path.join(cwd, "cloudflare.config.ts"), "utf8")
		).resolves.toContain("Migration incomplete.");
	});

	it("does not inspect ancestor manifests when installation is disabled", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"package.json": "{",
			"worker/package.json": JSON.stringify({ name: "example-worker" }),
			"worker/wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
			}),
		});
		const workerDirectory = path.join(cwd, "worker");

		const result = await migrateWranglerToCf(
			path.join(workerDirectory, "wrangler.json"),
			{ installDependencies: false }
		);

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			followUps: [{ blocking: true, code: "cf-install-disabled" }],
			status: "needs-intervention",
		});
		await expect(
			readFile(path.join(workerDirectory, "cloudflare.config.ts"), "utf8")
		).resolves.toContain("Migration incomplete.");
	});

	it("reports skipped ancestor installation in writes and dry runs", async ({
		expect,
	}) => {
		function createNestedProject(): Promise<string> {
			return createProject({
				"package.json": JSON.stringify({ name: "parent-project" }),
				"worker/wrangler.json": JSON.stringify({
					compatibility_date: "2026-09-23",
					name: "example-worker",
				}),
			});
		}
		const [writeCwd, dryRunCwd] = await Promise.all([
			createNestedProject(),
			createNestedProject(),
		]);

		const [writeResult, dryRunResult] = await Promise.all([
			migrateWranglerToCf(path.join(writeCwd, "worker/wrangler.json")),
			migrateWranglerToCf(path.join(dryRunCwd, "worker/wrangler.json"), {
				dryRun: true,
			}),
		]);

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
		for (const result of [writeResult, dryRunResult]) {
			expect(result).toMatchObject({
				followUps: [{ blocking: true, code: "cf-install-skipped" }],
				status: "needs-intervention",
			});
		}
		await expect(
			readFile(path.join(writeCwd, "worker/cloudflare.config.ts"), "utf8")
		).resolves.toContain(
			"An ancestor package.json was found, but it was not modified"
		);
	});

	it("reports a missing package manifest in writes and dry runs", async ({
		expect,
	}) => {
		function createManifestFreeProject(): Promise<string> {
			return createProject({
				"wrangler.json": JSON.stringify({
					compatibility_date: "2026-09-23",
					name: "example-worker",
				}),
			});
		}
		const [writeCwd, dryRunCwd] = await Promise.all([
			createManifestFreeProject(),
			createManifestFreeProject(),
		]);

		const [writeResult, dryRunResult] = await Promise.all([
			migrateWranglerToCf(path.join(writeCwd, "wrangler.json")),
			migrateWranglerToCf(path.join(dryRunCwd, "wrangler.json"), {
				dryRun: true,
			}),
		]);

		for (const result of [writeResult, dryRunResult]) {
			expect(result).toMatchObject({
				followUps: [{ blocking: true, code: "cf-install-missing-manifest" }],
				status: "needs-intervention",
			});
		}
		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
	});

	it("installs only after writing outputs", async ({ expect }) => {
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

	it("retains output and reports dependency installation failures", async ({
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
			followUps: [{ blocking: true, code: "cf-install-failed" }],
			status: "needs-intervention",
		});
		const cloudflareConfig = await readFile(
			path.join(cwd, "cloudflare.config.ts"),
			"utf8"
		);
		expect(cloudflareConfig).toContain("Registry unavailable.");
		expect(cloudflareConfig).toContain("Migration incomplete.");
	});

	it("removes outputs when an installation failure cannot be written", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"node_modules/wrangler/package.json": JSON.stringify({
				name: "wrangler",
				version: "4.100.0",
			}),
			"package.json": JSON.stringify({ name: "example-worker" }),
			"wrangler.json": JSON.stringify({
				assets: { directory: "public" },
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
		});
		vi.mocked(installPackages).mockRejectedValueOnce(
			new Error("Registry unavailable.")
		);
		vi.mocked(rewriteMigrationOutput).mockRejectedValueOnce(
			new Error("rewrite failed")
		);

		await expect(
			migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
				bundler: "wrangler",
			})
		).rejects.toThrow("rewrite failed");
		for (const filePath of ["cloudflare.config.ts", "wrangler.config.ts"]) {
			await expect(
				readFile(path.join(cwd, filePath), "utf8")
			).rejects.toMatchObject({ code: "ENOENT" });
		}
	});

	it("writes Wrangler tooling only for the Wrangler bundler", async ({
		expect,
	}) => {
		const source = JSON.stringify({
			assets: { directory: "public" },
			compatibility_date: "2026-09-23",
			name: "example-worker",
			no_bundle: true,
		});
		const viteCwd = await createProject({ "wrangler.json": source });
		const wranglerCwd = await createProject({
			"node_modules/wrangler/package.json": JSON.stringify({
				name: "wrangler",
				version: "4.100.0",
			}),
			"wrangler.json": source,
		});

		const viteResult = await migrateWranglerToCf(
			path.join(viteCwd, "wrangler.json")
		);
		const wranglerResult = await migrateWranglerToCf(
			path.join(wranglerCwd, "wrangler.json"),
			{ bundler: "wrangler" }
		);

		expect(viteResult.changedFiles).toEqual(["cloudflare.config.ts"]);
		expect(wranglerResult.changedFiles).toEqual([
			"cloudflare.config.ts",
			"wrangler.config.ts",
		]);
	});

	it("requires a compatible Wrangler for tooling output", async ({
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
			migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
				bundler: "wrangler",
				dryRun: true,
			})
		).rejects.toThrow("requires wrangler 4.100.0 or newer");
		await expect(
			readFile(path.join(cwd, "cloudflare.config.ts"), "utf8")
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("migrates each Worker relative to its config", async ({ expect }) => {
		const cwd = await createProject({
			"workers/auth/wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "auth-worker",
			}),
			"workers/entry/wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "entry-worker",
				services: [{ binding: "AUTH", service: "auth-worker" }],
			}),
		});

		const [authResult, entryResult] = await Promise.all([
			migrateWranglerToCf(path.join(cwd, "workers/auth/wrangler.json")),
			migrateWranglerToCf(path.join(cwd, "workers/entry/wrangler.json")),
		]);

		expect(authResult.changedFiles).toEqual(["cloudflare.config.ts"]);
		expect(entryResult.changedFiles).toEqual(["cloudflare.config.ts"]);
		await expect(
			readFile(path.join(cwd, "workers/entry/cloudflare.config.ts"), "utf8")
		).resolves.toContain("AUTH: bindings.worker");
	});

	it("does not write during a dry run", async ({ expect }) => {
		const cwd = await createProject({
			"wrangler.toml":
				'name = "example-worker"\ncompatibility_date = "2026-09-23"\n',
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.toml"), {
			dryRun: true,
		});

		expect(result.changedFiles).toEqual(["cloudflare.config.ts"]);
		await expect(
			readFile(path.join(cwd, "cloudflare.config.ts"), "utf8")
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("never overwrites existing output", async ({ expect }) => {
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
