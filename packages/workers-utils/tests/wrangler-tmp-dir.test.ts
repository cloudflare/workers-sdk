import fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "vitest";
import { runInTempDir } from "../src/test-helpers";
import {
	getWranglerHiddenDirPath,
	sweepStaleWranglerTmpDirs,
} from "../src/wrangler-tmp-dir";

describe("getWranglerHiddenDirPath()", () => {
	it("should return .wrangler path in project root", ({ expect }) => {
		expect(getWranglerHiddenDirPath("/project")).toBe(
			path.join("/project", ".wrangler")
		);
	});

	it("should use current working directory when projectRoot is undefined", ({
		expect,
	}) => {
		expect(getWranglerHiddenDirPath(undefined)).toBe(
			path.join(process.cwd(), ".wrangler")
		);
	});
});

describe("sweepStaleWranglerTmpDirs()", () => {
	runInTempDir();

	const ageDir = (dir: string, ageMs: number): void => {
		const seconds = (Date.now() - ageMs) / 1000;
		fs.utimesSync(dir, seconds, seconds);
	};

	it("removes orphaned dirs older than the staleness threshold", ({
		expect,
	}) => {
		const tmpRoot = path.join(process.cwd(), ".wrangler", "tmp");
		fs.mkdirSync(tmpRoot, { recursive: true });
		const stale = path.join(tmpRoot, "bundle-stale");
		const fresh = path.join(tmpRoot, "bundle-fresh");
		fs.mkdirSync(stale);
		fs.mkdirSync(fresh);
		ageDir(stale, 2 * 24 * 60 * 60 * 1000);

		sweepStaleWranglerTmpDirs(tmpRoot);

		expect(fs.existsSync(stale)).toBe(false);
		expect(fs.existsSync(fresh)).toBe(true);
	});

	it("does not throw when the tmp root is missing", ({ expect }) => {
		const tmpRoot = path.join(process.cwd(), ".wrangler", "tmp");
		expect(() => sweepStaleWranglerTmpDirs(tmpRoot)).not.toThrow();
	});

	it("only sweeps a given root once per process", ({ expect }) => {
		const tmpRoot = path.join(process.cwd(), ".wrangler", "tmp");
		fs.mkdirSync(tmpRoot, { recursive: true });
		const orphan = path.join(tmpRoot, "bundle-orphan");
		fs.mkdirSync(orphan);
		ageDir(orphan, 2 * 24 * 60 * 60 * 1000);

		sweepStaleWranglerTmpDirs(tmpRoot);
		expect(fs.existsSync(orphan)).toBe(false);

		// Recreate an equally stale entry; the cached root must skip rescanning.
		fs.mkdirSync(orphan);
		ageDir(orphan, 2 * 24 * 60 * 60 * 1000);
		sweepStaleWranglerTmpDirs(tmpRoot);
		expect(fs.existsSync(orphan)).toBe(true);
	});
});
