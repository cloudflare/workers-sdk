import { initDeployHelpersContext } from "@cloudflare/deploy-helpers";
import { logger } from "@cloudflare/deploy-helpers/context";
import { describe, it } from "vitest";

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
			isNonInteractiveOrCI: () => false,
		});

		expect(logger).toBe(mockLogger);
	});
});
