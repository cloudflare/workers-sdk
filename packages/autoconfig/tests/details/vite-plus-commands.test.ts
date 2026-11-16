import { NpmPackageManager } from "@cloudflare/workers-utils";
import { describe, test } from "vitest";
import { getProjectCommand } from "../../src/details";

describe("Vite+ commands", () => {
	test("defaults to direct local commands for cf", ({ expect }) => {
		const pkg = { devDependencies: { "vite-plus": "1.4.0" } };
		expect(getProjectCommand("vite", NpmPackageManager, pkg)).toBe("vp dev");
		expect(getProjectCommand("vite build", NpmPackageManager, pkg)).toBe(
			"vp build"
		);
		expect(getProjectCommand("astro build", NpmPackageManager)).toBe(
			"astro build"
		);
		expect(getProjectCommand("vite build", NpmPackageManager, {})).toBe(
			"vite build"
		);
		expect(getProjectCommand("npm run build", NpmPackageManager)).toBe(
			"npm run build"
		);
		expect(getProjectCommand(undefined, NpmPackageManager)).toBeUndefined();
	});

	test("uses direct local commands for cf", ({ expect }) => {
		const pkg = { devDependencies: { "vite-plus": "1.4.0" } };
		expect(getProjectCommand("vite", NpmPackageManager, pkg, "cf")).toBe(
			"vp dev"
		);
		expect(getProjectCommand("vite build", NpmPackageManager, pkg, "cf")).toBe(
			"vp build"
		);
		expect(getProjectCommand("astro build", NpmPackageManager, pkg, "cf")).toBe(
			"astro build"
		);
		expect(
			getProjectCommand("npm run build", NpmPackageManager, pkg, "cf")
		).toBe("npm run build");
	});

	test.for(["npx", "pnpm", "yarn", "bunx"])(
		"uses the local toolchain through %s for Wrangler",
		(npx, { expect }) => {
			const manager = { ...NpmPackageManager, npx };
			const pkg = { devDependencies: { "vite-plus": "1.4.0" } };
			expect(getProjectCommand("vite", manager, pkg, "wrangler")).toBe(
				`${npx} vp dev`
			);
			expect(getProjectCommand("vite dev", manager, pkg, "wrangler")).toBe(
				`${npx} vp dev`
			);
			expect(getProjectCommand("vite build", manager, pkg, "wrangler")).toBe(
				`${npx} vp build`
			);
			expect(
				getProjectCommand(`${npx} vite build`, manager, pkg, "wrangler")
			).toBe(`${npx} vp build`);
		}
	);
	test("preserves Wrangler framework scripts and projects without Vite+", ({
		expect,
	}) => {
		const pkg = { dependencies: { "vite-plus": "1.4.0" } };
		expect(
			getProjectCommand("astro build", NpmPackageManager, pkg, "wrangler")
		).toBe("npx astro build");
		expect(
			getProjectCommand("npm run build", NpmPackageManager, pkg, "wrangler")
		).toBe("npm run build");
		expect(
			getProjectCommand("vite build", NpmPackageManager, {}, "wrangler")
		).toBe("npx vite build");
	});
});
