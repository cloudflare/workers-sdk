import { NpmPackageManager } from "@cloudflare/workers-utils";
import { describe, test } from "vitest";
import { getProjectCommand } from "../../src/details";

describe("Vite+ commands", () => {
	test.for(["npx", "pnpm", "yarn", "bunx"])(
		"uses the local toolchain through %s",
		(npx, { expect }) => {
			const manager = { ...NpmPackageManager, npx };
			const pkg = { devDependencies: { "vite-plus": "1.4.0" } };
			expect(getProjectCommand("vite", manager, pkg)).toBe(`${npx} vp dev`);
			expect(getProjectCommand("vite dev", manager, pkg)).toBe(`${npx} vp dev`);
			expect(getProjectCommand("vite build", manager, pkg)).toBe(
				`${npx} vp build`
			);
			expect(getProjectCommand(`${npx} vite build`, manager, pkg)).toBe(
				`${npx} vp build`
			);
		}
	);
	test("preserves framework scripts and projects without Vite+", ({
		expect,
	}) => {
		const pkg = { dependencies: { "vite-plus": "1.4.0" } };
		expect(getProjectCommand("astro build", NpmPackageManager, pkg)).toBe(
			"npx astro build"
		);
		expect(getProjectCommand("npm run build", NpmPackageManager, pkg)).toBe(
			"npm run build"
		);
		expect(getProjectCommand("vite build", NpmPackageManager, {})).toBe(
			"npx vite build"
		);
	});
});
