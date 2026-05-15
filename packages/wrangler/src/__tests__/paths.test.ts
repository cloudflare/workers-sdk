import fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "vitest";
import {
	getBasePath,
	getWranglerHiddenDirPath,
	readableRelative,
	sweepStaleWranglerTmpDirs,
} from "../paths";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("paths", () => {
	describe("getBasePath()", () => {
		it("should return the path to the wrangler package", ({ expect }) => {
			expect(getBasePath()).toMatch(/packages[/\\]wrangler$/);
		});

		it("should use the __RELATIVE_PACKAGE_PATH__ as defined on the global context to compute the base path", ({
			expect,
		}) => {
			(
				global as unknown as { __RELATIVE_PACKAGE_PATH__: string }
			).__RELATIVE_PACKAGE_PATH__ = "/foo/bar";
			expect(getBasePath()).toEqual(path.resolve("/foo/bar"));
		});
	});

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

describe("readableRelative", () => {
	const base = process.cwd();

	it("should leave paths to files in the current directory as-is", ({
		expect,
	}) => {
		expect(readableRelative(path.join(base, "wrangler.toml"))).toBe(
			`wrangler.toml`
		);
	});

	it("should leave files in the parent directory as-is", ({ expect }) => {
		expect(readableRelative(path.resolve(base, "../wrangler.toml"))).toMatch(
			/^\..[/\\]wrangler.toml$/
		);
	});

	it("should add ./ to nested paths", ({ expect }) => {
		expect(
			readableRelative(path.join(base, "subdir", "wrangler.toml"))
		).toMatch(/^\.[/\\]subdir[/\\]wrangler\.toml$/);
	});
});
