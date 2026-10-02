import {
	addRequiredSecretsInheritBindings,
	initDeployHelpersContext,
	renderD1DatabaseLimitError,
	renderInconsistentExportsAcrossVersionsError,
	renderWorkersDevDefaultWarning,
	validateNodeCompatMode,
} from "@cloudflare/deploy-helpers";
import { cliPresentation, logger } from "@cloudflare/deploy-helpers/context";
import {
	CF_CLI_PRESENTATION,
	WRANGLER_CLI_PRESENTATION,
} from "@cloudflare/workers-utils";
import { describe, it, vi } from "vitest";
import type { Config } from "@cloudflare/workers-utils";
import type { CliPresentationOverrides } from "@cloudflare/workers-utils";

describe("context singleton", () => {
	// Verifies that both package entry points (. and ./context) share the same
	// context module. This only holds if tsup's splitting is enabled — if it's
	// disabled, each entry bundles its own copy and this test will fail.
	it("init from main entry propagates to context entry", ({ expect }) => {
		const mockLogger = { debug: () => {}, log: () => {} };

		initDeployHelpersContext({
			logger: mockLogger as never,
			fetchResult: (() => {}) as never,
			fetchListResult: (() => {}) as never,
			fetchPagedListResult: (() => {}) as never,
			fetchKVGetValue: (() => {}) as never,
			confirm: (() => {}) as never,
			prompt: (() => {}) as never,
			select: (() => {}) as never,
		});

		expect(logger).toBe(mockLogger);
	});

	it("resolves consumer-specific presentation copy", ({ expect }) => {
		initDeployHelpersContext({
			cliPresentation: CF_CLI_PRESENTATION,
			logger: {} as never,
			fetchResult: (() => {}) as never,
			fetchListResult: (() => {}) as never,
			fetchPagedListResult: (() => {}) as never,
			fetchKVGetValue: (() => {}) as never,
			confirm: (() => {}) as never,
			prompt: (() => {}) as never,
			select: (() => {}) as never,
		});

		expect(cliPresentation).toMatchObject({
			cliName: "cf",
			commands: {
				deploy: "cf deploy",
				versionsDeploy: "cf workers deployments create",
			},
		});

		expect(() =>
			addRequiredSecretsInheritBindings(
				{ secrets: { required: ["API_TOKEN"] } } as Config,
				{},
				{ type: "deploy", workerExists: false }
			)
		).toThrow(
			"This Worker does not exist yet, so secrets cannot be set in advance with `cf workers secrets update`."
		);
	});
});

describe("validateNodeCompatMode caller-specific warnings", () => {
	const cases = [
		[WRANGLER_CLI_PRESENTATION, "Wrangler's bundling"],
		[CF_CLI_PRESENTATION, "cf's bundling"],
	] as const;

	for (const [presentationOverride, expected] of cases) {
		it(`uses ${expected}`, ({ expect }) => {
			const warn = vi.fn();
			initContext(presentationOverride, warn);

			validateNodeCompatMode("2024-09-23", ["nodejs_compat_v2"], {
				noBundle: true,
			});

			expect(warn).toHaveBeenCalledWith(expect.stringContaining(expected));
		});
	}
});

describe("cf presentation copy", () => {
	it("preserves the inconsistent exports message and appends actionable next-steps", ({
		expect,
	}) => {
		initContext(CF_CLI_PRESENTATION, vi.fn());

		const out = renderInconsistentExportsAcrossVersionsError(
			"All versions in a multi-version deployment must declare identical `exports`. Deploy the version that changes `exports` at 100% first, then split traffic."
		);

		expect(out).toMatchInlineSnapshot(`
			"All versions in a multi-version deployment must declare identical \`exports\`. Deploy the version that changes \`exports\` at 100% first, then split traffic.

			All versions in a percentage-split deployment must declare identical Durable Object \`exports\`. Cloudflare requires this so traffic on one branch can't route to code referencing unprovisioned or just-deleted DO namespaces.

			What to do:
			  1. Deploy the version that changes \`exports\` at 100% first:
			       cf workers deployments create --worker <worker-name> --strategy percentage --versions '[{"version_id":"<new-version-id>","percentage":100}]'
			  2. Once that deploy is stable, run your percentage-split deploy.

			Learn more: https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/#gradual-deployments-for-durable-objects"
		`);
	});

	it("renders D1 database limit guidance", ({ expect }) => {
		initContext(CF_CLI_PRESENTATION, vi.fn());

		expect(renderD1DatabaseLimitError("1701")).toMatchInlineSnapshot(`
			"You have reached the maximum number of D1 databases for your account.

			On the Workers Free plan? Upgrade to create more:
			https://dash.cloudflare.com/1701/workers/plans

			Already on a paid plan? You can request a higher limit — learn more in the D1 docs:
			https://developers.cloudflare.com/d1/

			Or free up space:
			To list your existing databases, run: cf d1 list
			To delete a database, run: cf d1 delete <database-name>"
		`);
	});

	it("renders the workers_dev config warning", ({ expect }) => {
		initContext(CF_CLI_PRESENTATION, vi.fn());

		expect(renderWorkersDevDefaultWarning(false, true)).toMatchInlineSnapshot(`
			"Because 'workers_dev' is not in your cloudflare.config.ts, it will be enabled for this deployment by default.
			To override this setting, you can disable workers.dev by explicitly setting 'workers_dev = false' in your cloudflare.config.ts."
		`);
	});
});

function initContext(
	presentationOverride: CliPresentationOverrides,
	warn: ReturnType<typeof vi.fn>
): void {
	initDeployHelpersContext({
		cliPresentation: presentationOverride,
		logger: { warn } as never,
		fetchResult: (() => {}) as never,
		fetchListResult: (() => {}) as never,
		fetchPagedListResult: (() => {}) as never,
		fetchKVGetValue: (() => {}) as never,
		confirm: (() => {}) as never,
		prompt: (() => {}) as never,
		select: (() => {}) as never,
	});
}
