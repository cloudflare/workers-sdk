import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "@cloudflare/workers-utils";
import { beforeEach, describe, it, vi } from "vitest";
import { fetchWorkerConfig } from "../src/deploy/helpers/download-worker-config";
import { initDeployHelpersContext } from "../src/shared/context";
import type { Route } from "@cloudflare/workers-utils";

describe("fetchWorkerConfig", () => {
	const fetchResult = vi.fn(async (_config: unknown, resource: string) => {
		if (resource.endsWith("/bindings")) {
			return [];
		}
		if (resource.includes("/routes?")) {
			return [];
		}
		if (resource.includes("/domains/records?")) {
			return [];
		}
		if (resource.endsWith("/subdomain")) {
			return { enabled: true, previews_enabled: false };
		}
		if (resource.endsWith("/schedules")) {
			return { schedules: [] };
		}
		return { script: {} };
	});

	beforeEach(() => {
		fetchResult.mockClear();
		initDeployHelpersContext({
			fetchResult: fetchResult as never,
			fetchListResult: (() => {}) as never,
			fetchPagedListResult: (() => {}) as never,
			fetchKVGetValue: (() => {}) as never,
			logger: {} as never,
			confirm: (() => {}) as never,
			prompt: (() => {}) as never,
			select: (() => {}) as never,
		});
	});

	it.for([
		{
			name: "all route metadata when no local routes are supplied",
			localRoutes: undefined,
			expectedRouteRequest: true,
			expectedCustomDomainRequest: true,
		},
		{
			name: "no route metadata for an empty local route list",
			localRoutes: [],
			expectedRouteRequest: false,
			expectedCustomDomainRequest: false,
		},
		{
			name: "ordinary route metadata for an ordinary local route",
			localRoutes: ["example.com/*"],
			expectedRouteRequest: true,
			expectedCustomDomainRequest: false,
		},
		{
			name: "custom-domain metadata for a local custom domain",
			localRoutes: [{ pattern: "example.com", custom_domain: true as const }],
			expectedRouteRequest: false,
			expectedCustomDomainRequest: true,
		},
	] satisfies {
		name: string;
		localRoutes: Route[] | undefined;
		expectedRouteRequest: boolean;
		expectedCustomDomainRequest: boolean;
	}[])("fetches $name", async (testCase, { expect }) => {
		await fetchWorkerConfig(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			"account-id",
			"worker-name",
			"production",
			testCase.localRoutes
		);

		const resources = fetchResult.mock.calls.map(([, resource]) => resource);
		expect(resources.some((resource) => resource.includes("/routes?"))).toBe(
			testCase.expectedRouteRequest
		);
		expect(
			resources.some((resource) => resource.includes("/domains/records?"))
		).toBe(testCase.expectedCustomDomainRequest);
	});
});
