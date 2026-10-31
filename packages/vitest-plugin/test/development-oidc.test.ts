import fs from "node:fs";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { parseProjectOptions } from "../src/pool/config";
import type { TestProject } from "vitest/node";

describe("live development OIDC opt-in", () => {
	runInTempDir();
	it.for([undefined, false, true])(
		"is independent of remote bindings and lazy until a getter",
		async (developmentOidc, { expect }) => {
			const configPath = path.resolve("wrangler.jsonc");
			fs.writeFileSync(
				configPath,
				JSON.stringify({
					name: "linked-worker",
					account_id: "a".repeat(32),
					compatibility_date: "2026-01-01",
					compatibility_flags: ["workers_oidc"],
					identities: [
						{
							binding: "IDENTITY",
							audience: "recipient",
						},
					],
				})
			);
			const project = {
				config: { root: process.cwd(), environment: "node" },
				vite: { config: { mode: "test" } },
			} as TestProject;
			const result = await parseProjectOptions(project, {
				wrangler: { configPath },
				remoteBindings: false,
				developmentOidc,
			});
			expect(result.developmentOidc).toBe(developmentOidc ?? false);
			expect(Boolean(result.miniflare?.developmentOidc)).toBe(
				developmentOidc ?? false
			);
		}
	);
	it("preserves explicit offline mocks when live issuance is disabled", async ({
		expect,
	}) => {
		const create = () => ({
			invoke: async () => new Response("e30.e30.c2ln"),
			dispose() {},
		});
		const mock = { key: "offline-test", create };
		const project = {
			config: { root: process.cwd(), environment: "node" },
			vite: { config: { mode: "test" } },
		} as TestProject;
		const result = await parseProjectOptions(project, {
			miniflare: { developmentOidc: mock },
		});
		expect(result.developmentOidc).toBe(false);
		expect(result.miniflare?.developmentOidc).toEqual(mock);
	});
});
