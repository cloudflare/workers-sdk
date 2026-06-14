import fs from "node:fs";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import {
	formatStandaloneBindingIssues,
	getStandaloneBindingIssues,
} from "../standalone/validate";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";
import type { Config } from "@cloudflare/workers-utils";

// `wrangler deploy` runs autoconfig before the standalone guard; mock the inner
// pieces so the command doesn't touch the network/filesystem heuristics.
vi.mock("../autoconfig/run");
vi.mock("../autoconfig/frameworks/utils/packages");

describe("standalone binding validation", () => {
	it("reports no issues for supported bindings", ({ expect }) => {
		const issues = getStandaloneBindingIssues({
			vars: { GREETING: "hello" },
			assets: { directory: "./public", binding: "ASSETS" },
		} as unknown as Config);

		expect(issues).toEqual([]);
	});

	it("flags stateful and platform bindings as unsupported", ({ expect }) => {
		const issues = getStandaloneBindingIssues({
			kv_namespaces: [{ binding: "MY_KV", id: "abc" }],
			r2_buckets: [{ binding: "MY_R2", bucket_name: "bucket" }],
			ai: { binding: "AI" },
			vars: { GREETING: "hello" },
		} as unknown as Config);

		expect(issues).toEqual(
			expect.arrayContaining([
				{ name: "MY_KV", type: "kv_namespace" },
				{ name: "MY_R2", type: "r2_bucket" },
				{ name: "AI", type: "ai" },
			])
		);
		// The plain `var` should not be reported.
		expect(issues).not.toContainEqual({ name: "GREETING", type: "plain_text" });
	});

	it("formats issues as a readable bullet list", ({ expect }) => {
		expect(
			formatStandaloneBindingIssues([
				{ name: "MY_KV", type: "kv_namespace" },
				{ name: "AI", type: "ai" },
			])
		).toMatchInlineSnapshot(`
			"  - MY_KV (kv_namespace)
			  - AI (ai)"
		`);
	});
});

describe("deploy standalone guard", () => {
	runInTempDir();
	mockAccountId();
	mockApiToken();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	it("errors when deploying a Worker configured as standalone", async ({
		expect,
	}) => {
		setIsTTY(false);
		writeWranglerConfig({
			main: "index.js",
			standalone: true,
		});
		writeWorkerSource();

		await expect(
			runWrangler("deploy")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: This Worker has \`standalone\` set, so it targets a self-hosted workerd runtime rather than Cloudflare. Use \`wrangler compile\` to build a standalone bundle, or remove \`standalone\` from your configuration to deploy to Cloudflare.]`
		);
	});

	it("allows a dry-run of a standalone Worker (reused by compile)", async ({
		expect,
	}) => {
		setIsTTY(false);
		writeWranglerConfig({
			main: "index.js",
			standalone: true,
		});
		writeWorkerSource();

		await runWrangler("deploy --dry-run --outdir dist");

		expect(fs.existsSync("dist/index.js")).toBe(true);
		expect(std.err).toBe("");
	});
});
