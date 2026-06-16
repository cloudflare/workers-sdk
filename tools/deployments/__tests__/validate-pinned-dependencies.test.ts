import { describe, it } from "vitest";
import { parseCatalog } from "../validate-catalog-usage";
import {
	isPinnedVersion,
	validateCatalogPins,
	validatePackagePins,
} from "../validate-pinned-dependencies";

describe("isPinnedVersion()", () => {
	it("should accept exact versions", ({ expect }) => {
		expect(isPinnedVersion("1.2.3")).toBe(true);
		expect(isPinnedVersion("0.0.14")).toBe(true);
		expect(isPinnedVersion("1.20260529.1")).toBe(true);
	});

	it("should accept exact prerelease and build versions", ({ expect }) => {
		expect(isPinnedVersion("4.1.0-beta.10")).toBe(true);
		expect(isPinnedVersion("2.0.0-rc.24")).toBe(true);
		expect(isPinnedVersion("1.2.3+build.5")).toBe(true);
	});

	it("should reject caret and tilde ranges", ({ expect }) => {
		expect(isPinnedVersion("^1.2.3")).toBe(false);
		expect(isPinnedVersion("~5.8.3")).toBe(false);
	});

	it("should reject comparator ranges", ({ expect }) => {
		expect(isPinnedVersion(">1.20260305.0 <2.0.0-0")).toBe(false);
		expect(isPinnedVersion(">=1.0.0")).toBe(false);
		expect(isPinnedVersion("^6.1.0 || ^7.0.0 || ^8.0.0")).toBe(false);
	});

	it("should reject wildcards and partial versions", ({ expect }) => {
		expect(isPinnedVersion("*")).toBe(false);
		expect(isPinnedVersion("1.x")).toBe(false);
		expect(isPinnedVersion("1.2")).toBe(false);
		expect(isPinnedVersion("1")).toBe(false);
	});

	it("should reject non-version specifiers", ({ expect }) => {
		expect(isPinnedVersion("")).toBe(false);
		expect(isPinnedVersion("latest")).toBe(false);
		expect(isPinnedVersion("workspace:*")).toBe(false);
		expect(isPinnedVersion("catalog:default")).toBe(false);
	});
});

describe("validateCatalogPins()", () => {
	it("should pass when all entries are pinned", ({ expect }) => {
		const errors = validateCatalogPins(
			new Map([
				["undici", "7.24.8"],
				["esbuild", "0.28.1"],
				["youch", "4.1.0-beta.10"],
			])
		);
		expect(errors).toEqual([]);
	});

	it("should flag ranged entries", ({ expect }) => {
		const errors = validateCatalogPins(
			new Map([
				["undici", "7.24.8"],
				["ci-info", "^4.4.0"],
				["typescript", "~5.8.3"],
			])
		);
		expect(errors).toHaveLength(2);
		expect(errors[0]).toContain('"ci-info"');
		expect(errors[0]).toContain('"^4.4.0"');
		expect(errors[1]).toContain('"typescript"');
	});

	it("should skip entries in the exceptions allowlist", ({ expect }) => {
		const errors = validateCatalogPins(
			new Map([["@cloudflare/workers-types", "^4.20260529.1"]]),
			new Set(["@cloudflare/workers-types"])
		);
		expect(errors).toEqual([]);
	});

	it("should still flag non-excepted ranged entries", ({ expect }) => {
		const errors = validateCatalogPins(
			new Map([
				["@cloudflare/workers-types", "^4.20260529.1"],
				["vite", "^8.0.12"],
			]),
			new Set(["@cloudflare/workers-types"])
		);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('"vite"');
	});

	it("should use the default exceptions allowlist", ({ expect }) => {
		const errors = validateCatalogPins(
			new Map([["@cloudflare/workers-types", "^4.20260529.1"]])
		);
		expect(errors).toEqual([]);
	});
});

describe("validatePackagePins()", () => {
	it("should pass when all dependencies are pinned", ({ expect }) => {
		const errors = validatePackagePins("test-package", "test-package", {
			name: "test-package",
			dependencies: { "blake3-wasm": "2.1.5", "path-to-regexp": "6.3.0" },
		});
		expect(errors).toEqual([]);
	});

	it("should flag ranged dependencies", ({ expect }) => {
		const errors = validatePackagePins("test-package", "test-package", {
			name: "test-package",
			dependencies: { sharp: "^0.34.5" },
		});
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('"sharp"');
		expect(errors[0]).toContain('"^0.34.5"');
		expect(errors[0]).toContain("dependencies");
	});

	it("should flag ranged optionalDependencies", ({ expect }) => {
		const errors = validatePackagePins("test-package", "test-package", {
			name: "test-package",
			optionalDependencies: { fsevents: "~2.3.2" },
		});
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('"fsevents"');
		expect(errors[0]).toContain("optionalDependencies");
	});

	it("should skip workspace, catalog, npm, link and file specifiers", ({
		expect,
	}) => {
		const errors = validatePackagePins("test-package", "test-package", {
			name: "test-package",
			dependencies: {
				miniflare: "workspace:*",
				"@cloudflare/kv-asset-handler": "workspace:^",
				esbuild: "catalog:default",
				aliased: "npm:other@1.2.3",
				linked: "link:../other",
				filed: "file:../other",
			},
		});
		expect(errors).toEqual([]);
	});

	it("should ignore peerDependencies and devDependencies", ({ expect }) => {
		const errors = validatePackagePins("test-package", "test-package", {
			name: "test-package",
			peerDependencies: { vitest: "^4.1.0", react: "^17.0.2 || ^18.2.21" },
			devDependencies: { typescript: "^5.0.0", esbuild: "^0.20.0" },
		});
		expect(errors).toEqual([]);
	});

	it("should report multiple violations across sections", ({ expect }) => {
		const errors = validatePackagePins("test-package", "test-package", {
			name: "test-package",
			dependencies: { zod: "^3.25.76", "blake3-wasm": "2.1.5" },
			optionalDependencies: { fsevents: "~2.3.2" },
		});
		expect(errors).toHaveLength(2);
		expect(errors[0]).toContain('"zod"');
		expect(errors[1]).toContain('"fsevents"');
	});
});

describe("parseCatalog()", () => {
	it("should parse quoted and unquoted entries", ({ expect }) => {
		const catalog = parseCatalog(
			[
				"packages:",
				"  - packages/*",
				"",
				"minimumReleaseAge: 1440",
				"",
				"catalog:",
				"  # a comment",
				'  "@cloudflare/workers-types": "^4.20260529.1"',
				'  undici: "7.24.8"',
				"  '@vitest/runner': 4.1.0",
				'  typescript: "~5.8.3"',
				"",
				"overrides:",
				'  "@types/node": "$@types/node"',
			].join("\n")
		);

		expect(catalog.get("@cloudflare/workers-types")).toBe("^4.20260529.1");
		expect(catalog.get("undici")).toBe("7.24.8");
		expect(catalog.get("@vitest/runner")).toBe("4.1.0");
		expect(catalog.get("typescript")).toBe("~5.8.3");
		// Should stop at the next top-level key.
		expect(catalog.has("@types/node")).toBe(false);
	});
});
