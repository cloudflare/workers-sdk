import {
	addRequiredSecretsInheritBindings,
	initDeployHelpersContext,
	renderD1DatabaseLimitError,
	renderInconsistentExportsAcrossVersionsError,
	renderWorkersDevDefaultWarning,
	validateNodeCompatMode,
} from "@cloudflare/deploy-helpers";
import { logger } from "@cloudflare/deploy-helpers/context";
import { describe, it, vi } from "vitest";
import type { Config, Logger } from "@cloudflare/workers-utils";

describe("context singleton", () => {
	// Verifies that both package entry points (. and ./context) share the same
	// context module. This only holds if tsup's splitting is enabled — if it's
	// disabled, each entry bundles its own copy and this test will fail.
	it("init from main entry propagates to context entry", ({ expect }) => {
		const mockLogger = { debug: () => {}, log: () => {} };

		initContext(mockLogger as Logger);

		expect(logger).toBe(mockLogger);
	});
});

describe("caller-specific guidance", () => {
	it("passes secret commands directly to required-secret validation", ({
		expect,
	}) => {
		expect(() =>
			addRequiredSecretsInheritBindings(
				{ secrets: { required: ["API_TOKEN"] } } as Config,
				{},
				{
					type: "deploy",
					workerExists: false,
					secretPutCommand: "test-cli secret put",
					uploadCommand: "test-cli deploy",
				}
			)
		).toThrow(
			"This Worker does not exist yet, so secrets cannot be set in advance with `test-cli secret put`."
		);
	});

	it("uses neutral node compatibility copy", ({ expect }) => {
		const warn = vi.fn();
		initContext({ warn } as unknown as Logger);

		validateNodeCompatMode("2024-09-23", ["nodejs_compat_v2"], {
			noBundle: true,
		});

		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("while disabling bundling")
		);
	});

	it("appends the supplied versions deploy command", ({ expect }) => {
		const out = renderInconsistentExportsAcrossVersionsError(
			"All versions in a multi-version deployment must declare identical `exports`. Deploy the version that changes `exports` at 100% first, then split traffic.",
			"test-cli versions deploy <version-id> --percentage 100"
		);

		expect(out).toMatchInlineSnapshot(`
			"All versions in a multi-version deployment must declare identical \`exports\`. Deploy the version that changes \`exports\` at 100% first, then split traffic.

			All versions in a percentage-split deployment must declare identical Durable Object \`exports\`. Cloudflare requires this so traffic on one branch can't route to code referencing unprovisioned or just-deleted DO namespaces.

			What to do:
			  1. Deploy the version that changes \`exports\` at 100% first:
			       test-cli versions deploy <version-id> --percentage 100
			  2. Once that deploy is stable, run your percentage-split deploy.

			Learn more: https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/#gradual-deployments-for-durable-objects"
		`);
	});

	it("renders the supplied D1 commands", ({ expect }) => {
		expect(
			renderD1DatabaseLimitError(
				"1701",
				"test-cli d1 list",
				"test-cli d1 delete <database-id>"
			)
		).toMatchInlineSnapshot(`
			"You have reached the maximum number of D1 databases for your account.

			On the Workers Free plan? Upgrade to create more:
			https://dash.cloudflare.com/1701/workers/plans

			Already on a paid plan? You can request a higher limit — learn more in the D1 docs:
			https://developers.cloudflare.com/d1/

			Or free up space:
			To list your existing databases, run: test-cli d1 list
			To delete a database, run: test-cli d1 delete <database-id>"
		`);
	});

	it("renders the supplied workers.dev config syntax", ({ expect }) => {
		expect(
			renderWorkersDevDefaultWarning(
				false,
				true,
				"test.config.ts",
				"workersDev",
				(value) => `workersDev: ${value}`
			)
		).toMatchInlineSnapshot(`
			"Because 'workersDev' is not in your test.config.ts, it will be enabled for this deployment by default.
			To override this setting, you can disable workers.dev by explicitly setting 'workersDev: false' in your test.config.ts."
		`);
	});
});

function initContext(loggerOverride: Logger): void {
	initDeployHelpersContext({
		logger: loggerOverride,
		fetchResult: (() => {}) as never,
		fetchListResult: (() => {}) as never,
		fetchPagedListResult: (() => {}) as never,
		fetchKVGetValue: (() => {}) as never,
		confirm: (() => {}) as never,
		prompt: (() => {}) as never,
		select: (() => {}) as never,
	});
}
