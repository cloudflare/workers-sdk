import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createBuilder } from "vite";
import { afterEach, describe, test } from "vitest";
import { cloudflare } from "../index";

const fixturesPath = fileURLToPath(
	new URL("./fixtures-standalone", import.meta.url)
);

function read(relative: string): string {
	return fs.readFileSync(path.join(fixturesPath, relative), "utf-8");
}

describe("standalone build", () => {
	afterEach(() => {
		for (const dir of ["dist", "dist-standalone", ".wrangler"]) {
			removeDirSync(path.join(fixturesPath, dir));
		}
	});

	test("emits a standalone workerd bundle when `standalone` is enabled", async ({
		expect,
	}) => {
		const builder = await createBuilder({
			root: fixturesPath,
			logLevel: "silent",
			plugins: [
				cloudflare({
					inspectorPort: false,
					persistState: false,
					standalone: true,
				}),
			],
		});

		await builder.buildApp();

		// The standalone plugin should have produced a self-contained workerd
		// bundle alongside the normal Vite output.
		const capnp = read("dist-standalone/config.capnp");
		expect(capnp).toContain("Workerd.Config");
		// The plain-text var is baked into the generated config.
		expect(capnp).toContain("GREETING");
		expect(capnp).toContain("hello from standalone vite");

		expect(
			fs.existsSync(path.join(fixturesPath, "dist-standalone/Dockerfile"))
		).toBe(true);
		expect(read("dist-standalone/entrypoint.sh")).toContain(
			"workerd serve config.capnp"
		);
		expect(read("dist-standalone/COMPILE_REPORT.md")).toContain(
			"standalone-worker"
		);
	});

	test("does not emit a standalone bundle by default", async ({ expect }) => {
		const builder = await createBuilder({
			root: fixturesPath,
			logLevel: "silent",
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
		});

		await builder.buildApp();

		expect(fs.existsSync(path.join(fixturesPath, "dist-standalone"))).toBe(
			false
		);
	});
});
