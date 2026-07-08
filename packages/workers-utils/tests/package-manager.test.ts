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
	});
});
