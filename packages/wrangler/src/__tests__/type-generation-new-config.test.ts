import * as fs from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runWrangler } from "./helpers/run-wrangler";

// Mock @cloudflare/config to avoid module.registerHooks incompatibility in vitest
vi.mock("@cloudflare/config", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;

	async function loadConfig(configPath: string) {
		const source = await fs.promises.readFile(configPath, "utf8");
		const mod = (await import(
			`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
		)) as { default: unknown };
		return {
			config: mod.default,
			dependencies: new Set<string>([configPath]),
		};
	}

	return {
		...actual,
		loadConfig,
		generateTypes: vi.fn().mockReturnValue("// Generated new-config types"),
	};
});

describe("wrangler types --x-new-config", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	beforeEach(() => {
		fs.writeFileSync(
			"./tsconfig.json",
			JSON.stringify({
				compilerOptions: { types: ["worker-configuration.d.ts"] },
			})
		);
	});

	it("should error without cloudflare.config.ts", async ({ expect }) => {
		await expect(
			runWrangler("types --x-new-config")
		).rejects.toMatchInlineSnapshot(
			`[Error: cloudflare.config.ts is required when --experimental-new-config is enabled.]`
		);
	});

	it("should generate types from cloudflare.config.ts", async ({ expect }) => {
		fs.writeFileSync(
			"./cloudflare.config.ts",
			`export default { name: "my-worker", compatibilityDate: "2026-05-18" };`
		);

		await runWrangler("types --x-new-config");

		const output = fs.readFileSync("./worker-configuration.d.ts", "utf-8");
		expect(output).toContain("Generated new-config types");
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should accept --experimental-new-config alias", async ({ expect }) => {
		fs.writeFileSync(
			"./cloudflare.config.ts",
			`export default { name: "my-worker", compatibilityDate: "2026-05-18" };`
		);

		await runWrangler("types --experimental-new-config");

		const output = fs.readFileSync("./worker-configuration.d.ts", "utf-8");
		expect(output).toContain("Generated new-config types");
		expect(std.err).toMatchInlineSnapshot(`""`);
	});
});
