import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getGlobalConfigPath } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
	findKeyringBinding,
	getKeyringInstallDir,
	installKeyringBindingSync,
	PINNED_KEYRING_VERSION,
	setNpmRunner,
} from "../../../src/credential-store/key-providers/lazy-installer";
import type { SpawnSyncReturns } from "node:child_process";

function mockResult({
	status = 0,
	stdout = "",
	stderr = "",
}: {
	status?: number | null;
	stdout?: string;
	stderr?: string;
} = {}): SpawnSyncReturns<string> {
	return {
		status,
		stdout,
		stderr,
		signal: null,
		output: [null, stdout, stderr],
		pid: 1,
	} as SpawnSyncReturns<string>;
}

// The keyring binding install dir is derived from the consumer-provided global
// config path (resolved fresh per call so the runInTempDir HOME stub applies).
const installDir = () => getKeyringInstallDir(getGlobalConfigPath());

describe("lazy keyring installer", () => {
	runInTempDir();
	let lastInvocation: string[] | undefined;

	beforeEach(() => {
		lastInvocation = undefined;
	});

	afterEach(() => {
		setNpmRunner(undefined);
	});

	describe("findKeyringBinding", () => {
		it("returns null when neither the lazy dir nor the global root has the binding", ({
			expect,
		}) => {
			setNpmRunner((args) => {
				lastInvocation = args;
				return mockResult({ stdout: "/nonexistent/global/root\n" });
			});
			expect(findKeyringBinding(installDir())).toBeNull();
			expect(lastInvocation).toEqual(["root", "-g"]);
		});

		it("returns the lazy install path when the binding lives there", ({
			expect,
		}) => {
			const dir = path.join(
				installDir(),
				"node_modules",
				"@napi-rs",
				"keyring"
			);
			mkdirSync(dir, { recursive: true });
			writeFileSync(path.join(dir, "index.js"), "module.exports = {};");
			expect(findKeyringBinding(installDir())).toBe(dir);
		});

		it("falls back to the global npm root when the lazy dir is empty", ({
			expect,
		}) => {
			const globalRoot = path.join(getGlobalConfigPath(), "global-npm-root");
			const bindingDir = path.join(globalRoot, "@napi-rs", "keyring");
			mkdirSync(bindingDir, { recursive: true });
			writeFileSync(path.join(bindingDir, "index.js"), "module.exports = {};");
			setNpmRunner(() => mockResult({ stdout: globalRoot + "\n" }));
			expect(findKeyringBinding(installDir())).toBe(bindingDir);
		});

		it("returns null when `npm root -g` throws (npm not on PATH)", ({
			expect,
		}) => {
			setNpmRunner(() => {
				throw new Error("spawn npm ENOENT");
			});
			expect(findKeyringBinding(installDir())).toBeNull();
		});

		it("returns null when `npm root -g` exits non-zero", ({ expect }) => {
			setNpmRunner(() => mockResult({ status: 1 }));
			expect(findKeyringBinding(installDir())).toBeNull();
		});

		it("memoizes the result so repeated calls do not re-spawn npm", ({
			expect,
		}) => {
			// Without memoization the resolver's per-credential-op resolution
			// would spawn `npm root -g` on every read/write. We probe at most
			// once per process for the missing-binding case.
			let spawnCount = 0;
			setNpmRunner((args) => {
				spawnCount += 1;
				lastInvocation = args;
				return mockResult({ stdout: "/nonexistent/global/root\n" });
			});
			expect(findKeyringBinding(installDir())).toBeNull();
			expect(findKeyringBinding(installDir())).toBeNull();
			expect(findKeyringBinding(installDir())).toBeNull();
			expect(spawnCount).toBe(1);
		});
	});

	describe("installKeyringBindingSync", () => {
		it("creates a private host package.json before invoking npm install", ({
			expect,
		}) => {
			setNpmRunner((args) => {
				lastInvocation = args;
				return mockResult({});
			});
			installKeyringBindingSync(installDir());
			const hostPkgJson = path.join(installDir(), "package.json");
			expect(existsSync(hostPkgJson)).toBe(true);
			expect(lastInvocation).toEqual([
				"install",
				`@napi-rs/keyring@${PINNED_KEYRING_VERSION}`,
				"--prefix",
				installDir(),
				"--no-save",
				"--no-audit",
				"--no-fund",
				"--no-package-lock",
				"--loglevel=error",
			]);
		});

		it("throws a UserError with the npm stderr on non-zero exit", ({
			expect,
		}) => {
			setNpmRunner(() => mockResult({ status: 1, stderr: "404 not found" }));
			expect(() => installKeyringBindingSync(installDir())).toThrow(
				/Failed to install `@napi-rs\/keyring` \(npm exited 1\)[\s\S]*404 not found/
			);
		});

		it("throws a UserError when the npm spawn itself fails (npm not on PATH)", ({
			expect,
		}) => {
			setNpmRunner(() => {
				throw new Error("spawn npm ENOENT");
			});
			expect(() => installKeyringBindingSync(installDir())).toThrow(
				/Failed to spawn `npm` to install the keyring backend/
			);
		});

		it("does not overwrite an existing host package.json", ({ expect }) => {
			const dir = installDir();
			mkdirSync(dir, { recursive: true });
			const hostPkgJson = path.join(dir, "package.json");
			writeFileSync(hostPkgJson, '{"customMarker":true}');

			setNpmRunner(() => mockResult({}));
			installKeyringBindingSync(installDir());
			expect(readFileSync(hostPkgJson, "utf-8")).toContain("customMarker");
		});

		it("invalidates the findKeyringBinding cache so a fresh install is picked up", ({
			expect,
		}) => {
			// Regression: `findKeyringBinding()` memoizes its result. The
			// install path must clear the cached "not found" entry so the
			// next resolution sees the freshly-installed binding instead of
			// reporting it as missing forever.
			const bindingDir = path.join(
				installDir(),
				"node_modules",
				"@napi-rs",
				"keyring"
			);
			let installCalled = false;
			setNpmRunner((args) => {
				if (args[0] === "root") {
					return mockResult({ stdout: "/nonexistent/global/root\n" });
				}
				// `install` arm: write the binding files in place so the
				// next `findKeyringBinding()` call discovers them.
				installCalled = true;
				mkdirSync(bindingDir, { recursive: true });
				writeFileSync(
					path.join(bindingDir, "index.js"),
					"module.exports = {};"
				);
				return mockResult({});
			});

			// First lookup populates the cache with `null`.
			expect(findKeyringBinding(installDir())).toBeNull();

			// Install lands the binding on disk and invalidates the cache.
			installKeyringBindingSync(installDir());
			expect(installCalled).toBe(true);

			// Next lookup must re-check the filesystem and return the new
			// binding path (not the cached `null`).
			expect(findKeyringBinding(installDir())).toBe(bindingDir);
		});
	});
});
