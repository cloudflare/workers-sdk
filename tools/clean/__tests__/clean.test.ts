import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clean } from "../clean";

describe("clean()", () => {
	let tmpDir: string;

	beforeEach(() => {
		// Use realpathSync because the temporary path can point to a symlink rather than the actual path.
		tmpDir = realpathSync(mkdtempSync(join(tmpdir(), "clean-tests")));
	});

	afterEach(() => {
		if (existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true });
		}
	});

	it("should remove a single directory", () => {
		const dir = join(tmpDir, "to-remove");
		mkdirSync(dir);
		writeFileSync(join(dir, "file.txt"), "content");

		clean([dir]);

		expect(existsSync(dir)).toBe(false);
	});

	it("should remove multiple directories", () => {
		const dir1 = join(tmpDir, "dir1");
		const dir2 = join(tmpDir, "dir2");
		mkdirSync(dir1);
		mkdirSync(dir2);

		clean([dir1, dir2]);

		expect(existsSync(dir1)).toBe(false);
		expect(existsSync(dir2)).toBe(false);
	});

	it("should silently handle non-existent paths", () => {
		const nonExistent = join(tmpDir, "does-not-exist");

		expect(() => clean([nonExistent])).not.toThrow();
	});

	it("should remove nested directories recursively", () => {
		const nested = join(tmpDir, "a", "b", "c");
		mkdirSync(nested, { recursive: true });
		writeFileSync(join(nested, "deep.txt"), "deep content");

		clean([join(tmpDir, "a")]);

		expect(existsSync(join(tmpDir, "a"))).toBe(false);
	});

	it("should remove a single file", () => {
		const file = join(tmpDir, "file.txt");
		writeFileSync(file, "content");

		clean([file]);

		expect(existsSync(file)).toBe(false);
	});

	it("should handle empty paths array", () => {
		expect(() => clean([])).not.toThrow();
	});
});
