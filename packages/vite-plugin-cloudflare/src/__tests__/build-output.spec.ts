import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	detectModuleType,
	linkBuildOutputDirectory,
} from "../plugins/build-output";

describe("detectModuleType", () => {
	const cases: Array<{ filename: string; expected: string }> = [
		{ filename: "entry.js", expected: "esm" },
		{ filename: "entry.mjs", expected: "esm" },
		{ filename: "lib.wasm", expected: "wasm" },
		{ filename: "raw.bin", expected: "data" },
		{ filename: "greeting.txt", expected: "text" },
		{ filename: "page.html", expected: "text" },
		{ filename: "query.sql", expected: "text" },
		{ filename: "data.json", expected: "json" },
		{ filename: "bundle.js.map", expected: "sourcemap" },
		{ filename: "unknown.xyz", expected: "data" },
		// Case-insensitive on extension
		{ filename: "ENTRY.JS", expected: "esm" },
		{ filename: "LIB.WASM", expected: "wasm" },
		// No extension → default `data`
		{ filename: "LICENSE", expected: "data" },
		// Nested paths — only the extension matters
		{ filename: "chunks/foo.js", expected: "esm" },
		{ filename: "chunks/foo.wasm", expected: "wasm" },
	];

	it.for(cases)(
		"maps $filename → $expected",
		({ filename, expected }, { expect }) => {
			expect(detectModuleType(filename)).toBe(expected);
		}
	);
});

describe("linkBuildOutputDirectory", () => {
	runInTempDir();

	it("exposes an environment output directory through a directory link", ({
		expect,
	}) => {
		const environmentOutputDirectory = path.resolve("dist/client");
		const buildOutputDirectory = path.resolve(
			".cloudflare/output/v0/workers/default/assets"
		);
		fs.mkdirSync(environmentOutputDirectory, { recursive: true });
		fs.writeFileSync(
			path.join(environmentOutputDirectory, "index.html"),
			"hello"
		);

		linkBuildOutputDirectory(buildOutputDirectory, environmentOutputDirectory);

		expect(fs.lstatSync(buildOutputDirectory).isSymbolicLink()).toBe(true);
		expect(fs.realpathSync(buildOutputDirectory)).toBe(
			fs.realpathSync(environmentOutputDirectory)
		);
		expect(
			fs.readFileSync(path.join(buildOutputDirectory, "index.html"), "utf8")
		).toBe("hello");
		if (process.platform !== "win32") {
			expect(path.isAbsolute(fs.readlinkSync(buildOutputDirectory))).toBe(
				false
			);
		}
	});

	it("is idempotent when the directory already links to the output", ({
		expect,
	}) => {
		const environmentOutputDirectory = path.resolve("dist/server");
		const buildOutputDirectory = path.resolve(
			".cloudflare/output/v0/workers/default/bundle"
		);
		fs.mkdirSync(environmentOutputDirectory, { recursive: true });

		linkBuildOutputDirectory(buildOutputDirectory, environmentOutputDirectory);
		expect(() =>
			linkBuildOutputDirectory(buildOutputDirectory, environmentOutputDirectory)
		).not.toThrow();
	});

	it("refuses to create an overlapping directory link", ({ expect }) => {
		const environmentOutputDirectory = path.resolve(".");
		const buildOutputDirectory = path.resolve(
			".cloudflare/output/v0/workers/default/assets"
		);

		expect(() =>
			linkBuildOutputDirectory(buildOutputDirectory, environmentOutputDirectory)
		).toThrow(/overlapping environment output directory/);
	});

	it("does not replace an existing Build Output directory", ({ expect }) => {
		const environmentOutputDirectory = path.resolve("dist/client");
		const buildOutputDirectory = path.resolve(
			".cloudflare/output/v0/workers/default/assets"
		);
		fs.mkdirSync(environmentOutputDirectory, { recursive: true });
		fs.mkdirSync(buildOutputDirectory, { recursive: true });

		expect(() =>
			linkBuildOutputDirectory(buildOutputDirectory, environmentOutputDirectory)
		).toThrow(/because it already exists/);
	});

	it("requires the environment output directory to exist", ({ expect }) => {
		const environmentOutputDirectory = path.resolve("dist/client");
		const buildOutputDirectory = path.resolve(
			".cloudflare/output/v0/workers/default/assets"
		);

		expect(() =>
			linkBuildOutputDirectory(buildOutputDirectory, environmentOutputDirectory)
		).toThrow(/environment output directory .* does not exist/);
	});
});
