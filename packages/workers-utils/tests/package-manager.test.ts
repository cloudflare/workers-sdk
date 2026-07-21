import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import {
	BunPackageManager,
	NpmPackageManager,
	NubPackageManager,
	PnpmPackageManager,
	YarnPackageManager,
} from "../src/package-manager";
import { runInTempDir, seed } from "../src/test-helpers";
import type { PackageManager } from "../src/package-manager";

const packageManagers: PackageManager[] = [
	NpmPackageManager,
	PnpmPackageManager,
	YarnPackageManager,
	BunPackageManager,
	NubPackageManager,
];

describe("package managers", () => {
	it("describes nub", ({ expect }) => {
		expect(NubPackageManager).toEqual({
			type: "nub",
			npx: "nubx",
			dlx: ["nubx"],
			lockFiles: ["nub.lock"],
		});
	});

	describe("lock file detection", () => {
		runInTempDir();

		// Detection is lock-file-based: a project is managed by the package
		// manager whose lock file is present, matching how consumers resolve it.
		const findByLockFile = (dir: string) =>
			packageManagers.find((pm) =>
				pm.lockFiles.some((lockFile) => existsSync(join(dir, lockFile)))
			);

		it("detects nub from nub.lock", async ({ expect }) => {
			await seed({ "nub.lock": "" });
			expect(findByLockFile(process.cwd())).toBe(NubPackageManager);
		});

		it("does not detect nub when nub.lock is absent", async ({ expect }) => {
			await seed({
				"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
			});
			expect(findByLockFile(process.cwd())).toBe(NpmPackageManager);
		});

		it("still detects nub from a malformed nub.lock", async ({ expect }) => {
			// Detection is presence-based and never parses lock file contents, so a
			// corrupt or truncated nub.lock resolves to nub just like a valid one.
			await seed({ "nub.lock": "\0not-a-valid-lockfile\0" });
			expect(findByLockFile(process.cwd())).toBe(NubPackageManager);
		});
	});
});
