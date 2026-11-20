import { writeFileSync } from "node:fs";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";
import type { ContainerApp } from "@cloudflare/workers-utils";

describe("container scheduling deprecation", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const heading = "DEPRECATED: Legacy container scheduling";
	const container = {
		name: "legacy",
		class_name: "Legacy",
		image: "docker.io/cloudflare/hello:1.0",
	} satisfies ContainerApp;

	beforeEach(() => {
		writeFileSync("index.js", "export class Legacy {}; export default {};");
	});

	for (const command of ["deploy", "versions upload"]) {
		it.for([undefined, "default"] as const)(
			`${command} warns for policy %s without blocking a dry run`,
			async (scheduling_policy, { expect }) => {
				writeWranglerConfig({
					containers: [{ ...container, scheduling_policy }],
					exports: { Legacy: { type: "durable-object", storage: "sqlite" } },
				});

				await runWrangler(`${command} index.js --dry-run`);

				expect(std.warn.match(new RegExp(heading, "g"))).toHaveLength(1);
				expect(std.out).not.toContain(heading);
				expect(std.info).not.toContain(heading);
				expect(std.warn).toContain("legacy (class: Legacy)");
				expect(std.warn).toContain(
					"Wrangler selects this policy automatically when scheduling_policy is omitted."
				);
				expect(std.warn).toContain("This warning does not block deployment.");
				expect(std.warn).toContain(
					"https://developers.cloudflare.com/containers/guides/migrate-to-durable-object-scheduling-policy/"
				);
				expect(std.out).toContain("--dry-run: exiting now.");
			}
		);

		it.for(["durable_object", "regional", "moon"] as const)(
			`${command} does not warn for policy %s`,
			async (scheduling_policy, { expect }) => {
				writeWranglerConfig({
					containers: [
						{
							...container,
							image:
								scheduling_policy === "durable_object"
									? undefined
									: container.image,
							scheduling_policy,
						},
					],
					exports: { Legacy: { type: "durable-object", storage: "sqlite" } },
				});

				await runWrangler(`${command} index.js --dry-run`);

				expect(std.warn).not.toContain(heading);
			}
		);

		it.for([
			{ scheduling_policy: "default", override: "regional", warns: false },
			{ scheduling_policy: "regional", override: "default", warns: true },
		] as const)(
			`${command} respects the unsafe policy override: %j`,
			async ({ scheduling_policy, override, warns }, { expect }) => {
				writeWranglerConfig({
					containers: [
						{
							...container,
							scheduling_policy,
							unsafe: { scheduling_policy: override },
						},
					],
					exports: { Legacy: { type: "durable-object", storage: "sqlite" } },
				});

				await runWrangler(`${command} index.js --dry-run`);

				expect(std.warn.includes(heading)).toBe(warns);
			}
		);

		it(`${command} warns only for the selected environment`, async ({
			expect,
		}) => {
			writeWranglerConfig({
				containers: [container],
				exports: { Legacy: { type: "durable-object", storage: "sqlite" } },
				env: {
					production: {
						containers: [{ ...container, scheduling_policy: "regional" }],
						exports: { Legacy: { type: "durable-object", storage: "sqlite" } },
					},
				},
			});

			await runWrangler(`${command} index.js --dry-run --env production`);

			expect(std.warn).not.toContain(heading);
		});
	}

	it("groups affected apps and warns in CI when container rollouts are skipped", async ({
		expect,
	}) => {
		vi.stubEnv("CI", "true");
		writeFileSync(
			"index.js",
			"export class Legacy {}; export class Explicit {}; export class Managed {}; export default {};"
		);
		writeWranglerConfig({
			containers: [
				{ ...container, class_name: undefined },
				{
					...container,
					name: "explicit",
					class_name: "Explicit",
					scheduling_policy: "default",
				},
				{
					name: "managed",
					class_name: "Managed",
					scheduling_policy: "durable_object",
				},
			],
			exports: {
				Legacy: {
					type: "durable-object",
					storage: "sqlite",
					container: "legacy",
				},
				Explicit: { type: "durable-object", storage: "sqlite" },
				Managed: { type: "durable-object", storage: "sqlite" },
			},
		});

		await runWrangler("deploy index.js --dry-run --containers-rollout=none");

		expect(std.warn.match(new RegExp(heading, "g"))).toHaveLength(1);
		expect(std.warn).toContain("legacy (class: Legacy)");
		expect(std.warn).toContain("explicit (class: Explicit)");
		expect(std.warn).not.toContain("managed");
		expect(std.out).toContain("--dry-run: exiting now.");
	});
});
