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
			["cf@latest", "@cloudflare/vite-plugin@beta"],
			{ cwd, dev: true, isWorkspaceRoot: false }
		);
		expect(result.changedFiles).toEqual([
			"cloudflare.config.ts",
			"package.json",
			"pnpm-lock.yaml",
		]);
		expect(result.requiresInstall).toBe(false);
	});

	it.for([
		{ packageManager: "npm", lockFile: "package-lock.json" },
		{ packageManager: "pnpm", lockFile: "pnpm-lock.yaml" },
		{ packageManager: "yarn", lockFile: "yarn.lock" },
		{ packageManager: "bun", lockFile: "bun.lock" },
		{ packageManager: "bun", lockFile: "bun.lockb" },
		{ packageManager: "nub", lockFile: "nub.lock" },
	] as const)(
		"upgrades an outdated Vite plugin with $packageManager ($lockFile)",
		async ({ packageManager, lockFile }, { expect }) => {
			const packageManagerVersion =
				lockFile === "bun.lockb" ? "1.1.0" : "1.2.0";
			const cwd = await createProject({
				"node_modules/@cloudflare/vite-plugin/package.json": JSON.stringify({
					name: "@cloudflare/vite-plugin",
					version: "1.60.2",
				}),
				"package.json": JSON.stringify({
					devDependencies: {
						"@cloudflare/vite-plugin": "^1.60.2",
						cf: "1.0.0-beta.5",
					},
					packageManager: `${packageManager}@${packageManagerVersion}`,
				}),
				[lockFile]: "old lockfile",
				"wrangler.json": JSON.stringify({
					compatibility_date: "2026-09-23",
					name: "example-worker",
				}),
			});
			vi.mocked(installPackages).mockImplementationOnce(async () => {
				await writeFile(
					path.join(cwd, "package.json"),
					JSON.stringify({
						devDependencies: {
							"@cloudflare/vite-plugin": "beta",
							cf: "1.0.0-beta.5",
						},
						packageManager: `${packageManager}@${packageManagerVersion}`,
					})
				);
				await writeFile(path.join(cwd, lockFile), "new lockfile");
			});

			const result = await migrateWranglerToCf(
				path.join(cwd, "wrangler.json"),
				{
					bundler: "vite",
				}
			);

			expect(vi.mocked(installPackages)).toHaveBeenCalledWith(
				packageManager,
				["@cloudflare/vite-plugin@beta"],
				{ cwd, dev: true, isWorkspaceRoot: false }
			);
			expect(result.changedFiles).toEqual([
				"cloudflare.config.ts",
				"package.json",
				lockFile,
			]);
			expect(result.requiresInstall).toBe(false);
		}
	);

	it.for([
		"^2.0.0-beta.sha-805ec1ff3",
		"beta",
		">=2.0.0-0 <3.0.0-0",
		"workspace:*",
		"catalog:default",
	])(
		"keeps a compatible Vite plugin declared as %s unchanged",
		async (declaredVersion, { expect }) => {
			const cwd = await createProject({
				"node_modules/@cloudflare/vite-plugin/package.json": JSON.stringify({
					name: "@cloudflare/vite-plugin",
					version: "2.0.0-beta.sha-805ec1ff3",
				}),
				"package.json": JSON.stringify({
					devDependencies: {
						"@cloudflare/vite-plugin": declaredVersion,
						cf: "1.0.0-beta.5",
					},
				}),
				"pnpm-lock.yaml": "unchanged lockfile",
				"wrangler.json": JSON.stringify({
					compatibility_date: "2026-09-23",
					name: "example-worker",
				}),
			});

			const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"));

			expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
			expect(result.changedFiles).toEqual(["cloudflare.config.ts"]);
			expect(result.requiresInstall).toBe(false);
			expect(await readFile(path.join(cwd, "pnpm-lock.yaml"), "utf8")).toBe(
				"unchanged lockfile"
			);
		}
	);

	it("upgrades when the installed plugin contradicts a compatible manifest", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"node_modules/@cloudflare/vite-plugin/package.json": JSON.stringify({
				name: "@cloudflare/vite-plugin",
				version: "1.60.2",
			}),
			"package.json": JSON.stringify({
				devDependencies: {
					"@cloudflare/vite-plugin": "^2.0.0-beta.sha-805ec1ff3",
					cf: "1.0.0-beta.5",
				},
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
			}),
		});

		await migrateWranglerToCf(path.join(cwd, "wrangler.json"));

		expect(vi.mocked(installPackages)).toHaveBeenCalledWith(
			"npm",
			["@cloudflare/vite-plugin@beta"],
			{ cwd, dev: true, isWorkspaceRoot: false }
		);
	});

	it("installs the Vite plugin when explicitly selected", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({
				devDependencies: { cf: "1.0.0-beta.5" },
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
			}),
		});

		await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			bundler: "vite",
		});

		expect(vi.mocked(installPackages)).toHaveBeenCalledWith(
			"npm",
			["@cloudflare/vite-plugin@beta"],
			{ cwd, dev: true, isWorkspaceRoot: false }
		);
	});

	it("preserves a production Vite plugin dependency", async ({ expect }) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({
				dependencies: { "@cloudflare/vite-plugin": "^1.60.2" },
				devDependencies: { cf: "1.0.0-beta.5" },
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
			}),
		});

		await migrateWranglerToCf(path.join(cwd, "wrangler.json"));

		expect(vi.mocked(installPackages)).toHaveBeenCalledWith(
			"npm",
			["@cloudflare/vite-plugin@beta"],
			{ cwd, dev: false, isWorkspaceRoot: false }
		);
	});

	it("leaves the Vite plugin unchanged for Wrangler migration", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({
				devDependencies: {
					"@cloudflare/vite-plugin": "^1.60.2",
					cf: "1.0.0-beta.5",
					wrangler: "^4.136.0",
				},
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
			}),
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			bundler: "wrangler",
		});

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
		expect(result.changedFiles).toEqual([
			"cloudflare.config.ts",
			"wrangler.config.ts",
		]);
	});

	it("previews a Vite plugin upgrade without installing it", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({
				devDependencies: {
					"@cloudflare/vite-plugin": "^1.60.2",
					cf: "1.0.0-beta.5",
				},
				packageManager: "pnpm@10.33.0",
			}),
			"pnpm-lock.yaml": "unchanged lockfile",
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
		expect(await readFile(path.join(cwd, "pnpm-lock.yaml"), "utf8")).toBe(
			"unchanged lockfile"
		);
		await expect(
			readFile(path.join(cwd, "cloudflare.config.ts"), "utf8")
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("reports a Vite plugin upgrade when installation is disabled", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({
				devDependencies: {
					"@cloudflare/vite-plugin": "^1.60.2",
					cf: "1.0.0-beta.5",
				},
			}),
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
			followUps: [{ blocking: true, code: "vite-plugin-install-disabled" }],
			requiresInstall: true,
			status: "needs-intervention",
		});
		expect(result.followUps[0].message).toContain(
			"@cloudflare/vite-plugin@beta"
		);
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

	it("reports the Bun lockfile planned by the declared version", async ({
		expect,
	}) => {
		const binaryLockCwd = await createProject({
			"package.json": JSON.stringify({
				name: "binary-lock-worker",
				packageManager: "bun@1.1.0",
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "binary-lock-worker",
			}),
		});
		const textLockCwd = await createProject({
			"package.json": JSON.stringify({
				name: "text-lock-worker",
				packageManager: "bun@1.2.0",
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "text-lock-worker",
			}),
		});

		const [binaryLockResult, textLockResult] = await Promise.all([
			migrateWranglerToCf(path.join(binaryLockCwd, "wrangler.json"), {
				dryRun: true,
			}),
			migrateWranglerToCf(path.join(textLockCwd, "wrangler.json"), {
				dryRun: true,
			}),
		]);

		expect(binaryLockResult.changedFiles).toContain("bun.lockb");
		expect(textLockResult.changedFiles).toContain("bun.lock");
	});

	it("reports an npm shrinkwrap in previews and installation results", async ({
		expect,
	}) => {
		const packageJson = {
			name: "shrinkwrapped-worker",
			packageManager: "npm@11.0.0",
		};
		const cwd = await createProject({
			"npm-shrinkwrap.json": JSON.stringify({
				lockfileVersion: 3,
				name: "shrinkwrapped-worker",
			}),
			"package.json": JSON.stringify(packageJson),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "shrinkwrapped-worker",
			}),
		});

		const previewResult = await migrateWranglerToCf(
			path.join(cwd, "wrangler.json"),
			{ dryRun: true }
		);
		vi.mocked(installPackages).mockImplementationOnce(async () => {
			await writeFile(
				path.join(cwd, "package.json"),
				JSON.stringify({
					...packageJson,
					devDependencies: { cf: "latest" },
				})
			);
			await writeFile(
				path.join(cwd, "npm-shrinkwrap.json"),
				JSON.stringify({
					lockfileVersion: 3,
					name: "shrinkwrapped-worker",
					packages: { "": { devDependencies: { cf: "latest" } } },
				})
			);
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"));

		expect(previewResult.changedFiles).toContain("npm-shrinkwrap.json");
		expect(previewResult.changedFiles).not.toContain("package-lock.json");
		expect(result.changedFiles).toContain("npm-shrinkwrap.json");
	});

	it("reports an ancestor workspace lockfile", async ({ expect }) => {
		const packageJson = {
			name: "workspace-worker",
			packageManager: "pnpm@10.27.0",
		};
		const cwd = await createProject({
			"package.json": JSON.stringify({
				name: "workspace",
				private: true,
				workspaces: ["worker"],
			}),
			"pnpm-lock.yaml": "lockfileVersion: 9",
			"worker/package.json": JSON.stringify(packageJson),
			"worker/wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "workspace-worker",
			}),
		});
		const workerDirectory = path.join(cwd, "worker");
		const rootLockFile = path.join("..", "pnpm-lock.yaml");

		const previewResult = await migrateWranglerToCf(
			path.join(workerDirectory, "wrangler.json"),
			{ dryRun: true }
		);
		vi.mocked(installPackages).mockImplementationOnce(async () => {
			await writeFile(
				path.join(workerDirectory, "package.json"),
				JSON.stringify({
					...packageJson,
					devDependencies: { cf: "latest" },
				})
			);
			await writeFile(
				path.join(cwd, "pnpm-lock.yaml"),
				"lockfileVersion: 9\npackages:"
			);
		});

		const result = await migrateWranglerToCf(
			path.join(workerDirectory, "wrangler.json")
		);

		expect(vi.mocked(installPackages)).toHaveBeenCalledWith(
			"pnpm",
			["cf@latest", "@cloudflare/vite-plugin@beta"],
			{ cwd: workerDirectory, dev: true, isWorkspaceRoot: false }
		);
		expect(previewResult.changedFiles).toContain(rootLockFile);
		expect(result.changedFiles).toContain(rootLockFile);
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
			bundler: "wrangler",
			installDependencies: false,
		});

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			followUps: [
				{ blocking: true, code: "cf-install-disabled" },
				{ blocking: true, code: "wrangler-upgrade-disabled" },
			],
			status: "needs-intervention",
		});
		await expect(
			readFile(path.join(cwd, "cloudflare.config.ts"), "utf8")
		).resolves.toContain("Migration incomplete.");
	});

	it("does not require an existing cf dependency to be installed", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({
				devDependencies: { cf: "1.0.0", wrangler: "^4.136.0" },
				name: "example-worker",
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
			}),
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			bundler: "wrangler",
			installDependencies: false,
		});

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
		expect(result.requiresInstall).toBe(false);
	});

	it("skips unreadable dependency state when installation is disabled", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"package.json": "{",
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
			}),
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			installDependencies: false,
		});

		expect(result).toMatchObject({
			changedFiles: ["cloudflare.config.ts"],
			requiresInstall: true,
		});
		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
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
			requiresInstall: true,
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
				requiresInstall: true,
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
			requiresInstall: true,
			status: "needs-intervention",
		});
		const cloudflareConfig = await readFile(
			path.join(cwd, "cloudflare.config.ts"),
			"utf8"
		);
		expect(cloudflareConfig).toContain("Registry unavailable.");
		expect(cloudflareConfig).toContain("Migration incomplete.");
	});

	it("reports package files changed before a later install fails", async ({
		expect,
	}) => {
		const packageJson = {
			dependencies: { wrangler: "4.99.0" },
			name: "example-worker",
		};
		const cwd = await createProject({
			"package-lock.json": "old lockfile",
			"package.json": JSON.stringify(packageJson),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
		});
		vi.mocked(installPackages)
			.mockImplementationOnce(async () => {
				await writeFile(
					path.join(cwd, "package.json"),
					JSON.stringify({
						...packageJson,
						devDependencies: { cf: "latest" },
					})
				);
				await writeFile(path.join(cwd, "package-lock.json"), "cf installed");
			})
			.mockRejectedValueOnce(new Error("Wrangler registry unavailable."));

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			bundler: "wrangler",
		});

		expect(vi.mocked(installPackages)).toHaveBeenCalledTimes(2);
		expect(result.changedFiles).toEqual([
			"cloudflare.config.ts",
			"wrangler.config.ts",
			"package.json",
			"package-lock.json",
		]);
		expect(result.followUps).toMatchObject([
			{ blocking: true, code: "wrangler-upgrade-failed" },
		]);
		expect(result.followUps[0].message).toContain("wrangler@latest");
		expect(result.followUps[0].message).not.toContain("cf@latest");
	});

	it("removes outputs when an installation failure cannot be written", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"node_modules/wrangler/package.json": JSON.stringify({
				name: "wrangler",
				version: "4.136.0",
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

	it("reports unreadable package manifests in writes and dry runs", async ({
		expect,
	}) => {
		function createUnreadableManifestProject(): Promise<string> {
			return createProject({
				"package.json": "{",
				"wrangler.json": JSON.stringify({
					compatibility_date: "2026-09-23",
					name: "example-worker",
				}),
			});
		}
		const [writeCwd, dryRunCwd] = await Promise.all([
			createUnreadableManifestProject(),
			createUnreadableManifestProject(),
		]);

		const [writeResult, dryRunResult] = await Promise.all([
			migrateWranglerToCf(path.join(writeCwd, "wrangler.json")),
			migrateWranglerToCf(path.join(dryRunCwd, "wrangler.json"), {
				dryRun: true,
			}),
		]);

		for (const result of [writeResult, dryRunResult]) {
			expect(result).toMatchObject({
				changedFiles: ["cloudflare.config.ts"],
				followUps: [{ blocking: true, code: "cf-install-failed" }],
				requiresInstall: true,
				status: "needs-intervention",
			});
		}
		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
		const generatedConfig = await readFile(
			path.join(writeCwd, "cloudflare.config.ts"),
			"utf8"
		);
		expect(generatedConfig).toContain(
			"Resolve the reported package.json error"
		);
		expect(generatedConfig).toContain("Package manifest error:");
		await expect(
			readFile(path.join(dryRunCwd, "cloudflare.config.ts"), "utf8")
		).rejects.toMatchObject({ code: "ENOENT" });
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
				version: "4.136.0",
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

	it("leaves Wrangler unchanged when Vite output does not need it", async ({
		expect,
	}) => {
		const manifest = JSON.stringify({
			devDependencies: {
				"@cloudflare/vite-plugin": "beta",
				cf: "^1.0.0",
				wrangler: "^4.99.0",
			},
			name: "example-worker",
		});
		const cwd = await createProject({
			"package-lock.json": "old lockfile",
			"package.json": manifest,
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"));

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
		expect(result.changedFiles).toEqual(["cloudflare.config.ts"]);
		expect(await readFile(path.join(cwd, "package.json"), "utf8")).toBe(
			manifest
		);
		expect(await readFile(path.join(cwd, "package-lock.json"), "utf8")).toBe(
			"old lockfile"
		);
	});

	it.for([
		{ manager: "npm", lockFile: "package-lock.json", managerVersion: "1.2.0" },
		{ manager: "pnpm", lockFile: "pnpm-lock.yaml", managerVersion: "1.2.0" },
		{ manager: "yarn", lockFile: "yarn.lock", managerVersion: "1.2.0" },
		{ manager: "bun", lockFile: "bun.lock", managerVersion: "1.2.0" },
		{ manager: "bun", lockFile: "bun.lockb", managerVersion: "1.1.0" },
		{ manager: "nub", lockFile: "nub.lock", managerVersion: "1.2.0" },
	])(
		"upgrades Wrangler 4.100.0 to latest with $manager and reports $lockFile",
		async ({ manager, lockFile, managerVersion }, { expect }) => {
			const packageJson = {
				devDependencies: { cf: "^1.0.0", wrangler: "^4.100.0" },
				name: "example-worker",
				packageManager: `${manager}@${managerVersion}`,
			};
			const cwd = await createProject({
				[lockFile]: "old lockfile",
				"node_modules/wrangler/package.json": JSON.stringify({
					name: "wrangler",
					version: "4.100.0",
				}),
				"package.json": JSON.stringify(packageJson),
				"wrangler.json": JSON.stringify({
					compatibility_date: "2026-09-23",
					name: "example-worker",
					no_bundle: true,
				}),
			});
			vi.mocked(installPackages).mockImplementationOnce(async () => {
				await writeFile(
					path.join(cwd, "package.json"),
					JSON.stringify({
						...packageJson,
						devDependencies: {
							...packageJson.devDependencies,
							wrangler: "latest",
						},
					})
				);
				await writeFile(path.join(cwd, lockFile), "updated lockfile");
			});

			const result = await migrateWranglerToCf(
				path.join(cwd, "wrangler.json"),
				{
					bundler: "wrangler",
				}
			);

			expect(vi.mocked(installPackages)).toHaveBeenCalledWith(
				manager,
				["wrangler@latest"],
				{ cwd, dev: true, isWorkspaceRoot: false }
			);
			expect(result.changedFiles).toEqual([
				"cloudflare.config.ts",
				"wrangler.config.ts",
				"package.json",
				lockFile,
			]);
			expect(result.status).toBe("complete");
		}
	);

	it("installs cf and Wrangler together from a project path with spaces", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"pnpm-lock.yaml": "old lockfile",
			"worker project/package.json": JSON.stringify({
				devDependencies: { wrangler: "^4.99.0" },
				name: "example-worker",
				packageManager: "pnpm@10.27.0",
			}),
			"worker project/wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
		});
		const projectDirectory = path.join(cwd, "worker project");
		vi.mocked(installPackages).mockImplementationOnce(async () => {
			await writeFile(
				path.join(projectDirectory, "package.json"),
				JSON.stringify({
					devDependencies: { cf: "latest", wrangler: "latest" },
					name: "example-worker",
					packageManager: "pnpm@10.27.0",
				})
			);
			await writeFile(path.join(cwd, "pnpm-lock.yaml"), "updated lockfile");
		});

		const result = await migrateWranglerToCf(
			path.join(projectDirectory, "wrangler.json"),
			{ bundler: "wrangler" }
		);

		expect(vi.mocked(installPackages)).toHaveBeenCalledExactlyOnceWith(
			"pnpm",
			["cf@latest", "wrangler@latest"],
			{ cwd: projectDirectory, dev: true, isWorkspaceRoot: false }
		);
		expect(result.changedFiles).toEqual([
			"cloudflare.config.ts",
			"wrangler.config.ts",
			"package.json",
			path.join("..", "pnpm-lock.yaml"),
		]);
	});

	it("keeps Wrangler in dependencies when upgrading it", async ({ expect }) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({
				dependencies: { wrangler: "4.99.0" },
				devDependencies: { cf: "^1.0.0" },
				name: "example-worker",
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
		});

		await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			bundler: "wrangler",
		});

		expect(vi.mocked(installPackages)).toHaveBeenCalledWith(
			"npm",
			["wrangler@latest"],
			{ cwd, dev: false, isWorkspaceRoot: false }
		);
	});

	it("installs latest Wrangler when the dependency is missing", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({
				devDependencies: { cf: "^1.0.0" },
				name: "example-worker",
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
		});

		await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			bundler: "wrangler",
		});

		expect(vi.mocked(installPackages)).toHaveBeenCalledExactlyOnceWith(
			"npm",
			["wrangler@latest"],
			{ cwd, dev: true, isWorkspaceRoot: false }
		);
	});

	it("leaves compatible Wrangler versions unchanged", async ({ expect }) => {
		const cwd = await createProject({
			"node_modules/wrangler/package.json": JSON.stringify({
				name: "wrangler",
				version: "4.136.0",
			}),
			"package.json": JSON.stringify({
				devDependencies: { cf: "^1.0.0", wrangler: "^4.136.0" },
				name: "example-worker",
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			bundler: "wrangler",
		});

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
		expect(result.changedFiles).toEqual([
			"cloudflare.config.ts",
			"wrangler.config.ts",
		]);
		expect(result.requiresInstall).toBe(false);
	});

	it.for([
		{
			workspaceFile: "pnpm-workspace.yaml",
			workspaceContents: 'packages:\n  - "apps/*"\n  - "packages/*"\n',
		},
		{
			workspaceFile: "package.json",
			workspaceContents: JSON.stringify({
				name: "workspace-root",
				workspaces: ["apps/*", "packages/*"],
			}),
		},
	])(
		"keeps a compatible workspace Wrangler without node_modules using $workspaceFile",
		async ({ workspaceFile, workspaceContents }, { expect }) => {
			const manifest = JSON.stringify({
				devDependencies: { cf: "^1.0.0", wrangler: "workspace:*" },
				name: "example-worker",
			});
			const cwd = await createProject({
				[workspaceFile]: workspaceContents,
				"apps/worker/package.json": manifest,
				"apps/worker/wrangler.json": JSON.stringify({
					compatibility_date: "2026-09-23",
					name: "example-worker",
					no_bundle: true,
				}),
				"packages/wrangler/package.json": JSON.stringify({
					name: "wrangler",
					version: "4.136.0",
				}),
			});
			const projectDirectory = path.join(cwd, "apps/worker");

			const result = await migrateWranglerToCf(
				path.join(projectDirectory, "wrangler.json"),
				{ bundler: "wrangler" }
			);

			expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
			expect(result).toMatchObject({
				changedFiles: ["cloudflare.config.ts", "wrangler.config.ts"],
				requiresInstall: false,
				status: "complete",
			});
			expect(
				await readFile(path.join(projectDirectory, "package.json"), "utf8")
			).toBe(manifest);
			expect(
				await readFile(
					path.join(projectDirectory, "cloudflare.config.ts"),
					"utf8"
				)
			).not.toContain("Migration incomplete.");
		}
	);

	it("keeps a compatible installed workspace Wrangler dependency", async ({
		expect,
	}) => {
		const manifest = JSON.stringify({
			devDependencies: { cf: "^1.0.0", wrangler: "workspace:*" },
			name: "example-worker",
		});
		const cwd = await createProject({
			"node_modules/wrangler/package.json": JSON.stringify({
				name: "wrangler",
				version: "4.136.0",
			}),
			"package.json": manifest,
			"pnpm-lock.yaml": "old lockfile",
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			bundler: "wrangler",
		});

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
		expect(result.changedFiles).toEqual([
			"cloudflare.config.ts",
			"wrangler.config.ts",
		]);
		expect(await readFile(path.join(cwd, "package.json"), "utf8")).toBe(
			manifest
		);
	});

	it("requests an update for an outdated workspace Wrangler without node_modules", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"pnpm-workspace.yaml": 'packages:\n  - "apps/*"\n  - "packages/*"\n',
			"apps/worker/package.json": JSON.stringify({
				devDependencies: { cf: "^1.0.0", wrangler: "workspace:*" },
				name: "example-worker",
			}),
			"apps/worker/wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
			"packages/wrangler/package.json": JSON.stringify({
				name: "wrangler",
				version: "4.135.0",
			}),
		});
		const projectDirectory = path.join(cwd, "apps/worker");

		const result = await migrateWranglerToCf(
			path.join(projectDirectory, "wrangler.json"),
			{ bundler: "wrangler" }
		);

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			followUps: [{ blocking: true, code: "wrangler-upgrade-manual" }],
			status: "needs-intervention",
		});
		expect(result.followUps[0].message).toContain(
			"Update the workspace Wrangler package"
		);
	});

	it("requests verification when a workspace Wrangler target cannot be found", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"pnpm-workspace.yaml": 'packages:\n  - "apps/*"\n  - "packages/*"\n',
			"apps/worker/package.json": JSON.stringify({
				devDependencies: { cf: "^1.0.0", wrangler: "workspace:*" },
				name: "example-worker",
			}),
			"apps/worker/wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
			"node_modules/wrangler/package.json": JSON.stringify({
				name: "wrangler",
				version: "4.136.0",
			}),
		});
		const projectDirectory = path.join(cwd, "apps/worker");

		const result = await migrateWranglerToCf(
			path.join(projectDirectory, "wrangler.json"),
			{ bundler: "wrangler" }
		);

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			followUps: [{ blocking: true, code: "wrangler-upgrade-manual" }],
			status: "needs-intervention",
		});
		expect(result.followUps[0].message).toContain(
			"Verify the workspace Wrangler package version"
		);
		expect(result.followUps[0].message).not.toContain(
			"Update the workspace Wrangler package and its lockfile"
		);
	});

	it("requests a manual update for an outdated workspace Wrangler", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"node_modules/wrangler/package.json": JSON.stringify({
				name: "wrangler",
				version: "4.135.0",
			}),
			"package.json": JSON.stringify({
				devDependencies: { wrangler: "workspace:*" },
				name: "example-worker",
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
		});
		vi.mocked(installPackages).mockResolvedValueOnce(undefined);

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			bundler: "wrangler",
		});

		expect(vi.mocked(installPackages)).toHaveBeenCalledExactlyOnceWith(
			"npm",
			["cf@latest"],
			{ cwd, dev: true, isWorkspaceRoot: false }
		);
		expect(result).toMatchObject({
			followUps: [{ blocking: true, code: "wrangler-upgrade-manual" }],
			requiresInstall: true,
			status: "needs-intervention",
		});
		expect(result.followUps[0].message).toContain(
			"preserving the workspace dependency"
		);
	});

	it("refreshes a latest Wrangler lockfile without node_modules", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"package.json": JSON.stringify({
				devDependencies: { cf: "^1.0.0", wrangler: "latest" },
				name: "example-worker",
				packageManager: "pnpm@10.27.0",
			}),
			"pnpm-lock.yaml": "wrangler 4.99.0",
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
		});
		vi.mocked(installPackages).mockImplementationOnce(async () => {
			await writeFile(path.join(cwd, "pnpm-lock.yaml"), "wrangler 4.136.0");
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			bundler: "wrangler",
		});

		expect(vi.mocked(installPackages)).toHaveBeenCalledExactlyOnceWith(
			"pnpm",
			["wrangler@latest"],
			{ cwd, dev: true, isWorkspaceRoot: false }
		);
		expect(result.changedFiles).toEqual([
			"cloudflare.config.ts",
			"wrangler.config.ts",
			"pnpm-lock.yaml",
		]);
	});

	it("refreshes an outdated installation with latest Wrangler", async ({
		expect,
	}) => {
		const cwd = await createProject({
			"node_modules/wrangler/package.json": JSON.stringify({
				name: "wrangler",
				version: "4.135.0",
			}),
			"package.json": JSON.stringify({
				devDependencies: { cf: "^1.0.0", wrangler: "^4.136.0" },
				name: "example-worker",
			}),
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
		});

		await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			bundler: "wrangler",
		});

		expect(vi.mocked(installPackages)).toHaveBeenCalledWith(
			"npm",
			["wrangler@latest"],
			{ cwd, dev: true, isWorkspaceRoot: false }
		);
	});

	it("previews a Wrangler upgrade without writing or installing", async ({
		expect,
	}) => {
		const manifest = JSON.stringify({
			devDependencies: { cf: "^1.0.0", wrangler: "^4.99.0" },
			name: "example-worker",
			packageManager: "pnpm@10.27.0",
		});
		const cwd = await createProject({
			"package.json": manifest,
			"pnpm-lock.yaml": "old lockfile",
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			bundler: "wrangler",
			dryRun: true,
		});

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
		expect(result.changedFiles).toEqual([
			"cloudflare.config.ts",
			"wrangler.config.ts",
			"package.json",
			"pnpm-lock.yaml",
		]);
		expect(await readFile(path.join(cwd, "package.json"), "utf8")).toBe(
			manifest
		);
		await expect(
			readFile(path.join(cwd, "cloudflare.config.ts"), "utf8")
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("reports an upgrade follow-up with --no-install", async ({ expect }) => {
		const manifest = JSON.stringify({
			devDependencies: { cf: "^1.0.0", wrangler: "^4.99.0" },
			name: "example-worker",
		});
		const cwd = await createProject({
			"package.json": manifest,
			"wrangler.json": JSON.stringify({
				compatibility_date: "2026-09-23",
				name: "example-worker",
				no_bundle: true,
			}),
		});

		const result = await migrateWranglerToCf(path.join(cwd, "wrangler.json"), {
			bundler: "wrangler",
			installDependencies: false,
		});

		expect(vi.mocked(installPackages)).not.toHaveBeenCalled();
		expect(result.changedFiles).toEqual([
			"cloudflare.config.ts",
			"wrangler.config.ts",
		]);
		expect(result.followUps).toMatchObject([
			{ blocking: true, code: "wrangler-upgrade-disabled" },
		]);
		expect(result.followUps[0].message).toContain("wrangler@latest");
		expect(await readFile(path.join(cwd, "package.json"), "utf8")).toBe(
			manifest
		);
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
