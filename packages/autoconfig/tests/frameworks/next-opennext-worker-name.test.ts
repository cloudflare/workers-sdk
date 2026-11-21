import { readFileSync } from "node:fs";
import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { parseJSONC } from "@cloudflare/workers-utils";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { getDetailsForAutoConfig } from "../../src/details";
import { runAutoConfig } from "../../src/run";
import { createMockContext } from "../helpers/mock-context";

vi.mock("@cloudflare/cli-shared-helpers/command");

/**
 * The `wrangler.jsonc` that `@opennextjs/cloudflare migrate` writes: it names the
 * Worker after package.json, and points the `WORKER_SELF_REFERENCE` service binding
 * at that same name (see `templates/wrangler.jsonc` in `@opennextjs/cloudflare`).
 *
 * @param packageJsonName The `name` in the project's package.json
 * @returns The contents of the generated `wrangler.jsonc`
 */
function openNextMigrateWranglerJsonc(packageJsonName: string): string {
	return JSON.stringify(
		{
			$schema: "node_modules/wrangler/config-schema.json",
			main: ".open-next/worker.js",
			name: packageJsonName,
			compatibility_date: "2026-08-01",
			compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
			assets: { directory: ".open-next/assets", binding: "ASSETS" },
			services: [
				{ binding: "WORKER_SELF_REFERENCE", service: packageJsonName },
			],
		},
		null,
		"\t"
	);
}

describe("autoconfig of a Next.js project with OpenNext (#17104)", () => {
	runInTempDir();
	mockConsoleMethods();

	beforeEach(async () => {
		vi.spyOn(cliPackages, "installWrangler").mockResolvedValue();
		await seed({
			"package.json": JSON.stringify({
				name: "ecommerce-pos",
				dependencies: { next: "15.5.0" },
			}),
			"next.config.mjs": "export default {};",
			"node_modules/next/package.json": JSON.stringify({
				name: "next",
				version: "15.5.0",
			}),
		});
		vi.mocked(runCommand).mockImplementation(async (command) => {
			if (Array.isArray(command) && command.includes("migrate")) {
				// `migrate` names the Worker after package.json, unless it is given a name
				const nameArg = command.find((arg) => arg.startsWith("--name="));
				await seed({
					"wrangler.jsonc": openNextMigrateWranglerJsonc(
						nameArg?.slice("--name=".length) ?? "ecommerce-pos"
					),
				});
			}
			return "";
		});
	});

	it("points the WORKER_SELF_REFERENCE service binding at the Worker name chosen by WRANGLER_CI_OVERRIDE_NAME", async ({
		expect,
	}) => {
		// Workers Builds names the Worker it deploys through WRANGLER_CI_OVERRIDE_NAME
		vi.stubEnv("WRANGLER_CI_OVERRIDE_NAME", "pos");
		const context = createMockContext();
		const details = await getDetailsForAutoConfig({
			context,
			target: "wrangler",
		});
		expect(details.framework?.id).toBe("next");
		expect(details.workerName).toBe("pos");

		await runAutoConfig(details, {
			context,
			target: "wrangler",
			skipConfirmations: true,
			enableTargetCliInstallation: false,
			runBuild: false,
		});

		const wranglerConfig = parseJSONC(
			readFileSync("wrangler.jsonc", "utf8")
		) as {
			name: string;
			services: { binding: string; service: string }[];
		};
		expect(wranglerConfig.name).toBe("pos");
		// Otherwise deploying fails with "Service binding 'WORKER_SELF_REFERENCE'
		// references Worker 'ecommerce-pos' which was not found. [code: 10143]"
		expect(wranglerConfig.services).toEqual([
			{ binding: "WORKER_SELF_REFERENCE", service: "pos" },
		]);
	});
});
