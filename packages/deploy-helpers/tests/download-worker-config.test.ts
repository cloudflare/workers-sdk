import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "@cloudflare/workers-utils";
import { beforeEach, describe, it, vi } from "vitest";
import { fetchWorkerConfig } from "../src/deploy/helpers/download-worker-config";
import { initDeployHelpersContext } from "../src/shared/context";

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
			name: "all route metadata",
			fetchRoutes: true,
			fetchCustomDomains: true,
		},
		{
			name: "no route metadata",
			fetchRoutes: false,
			fetchCustomDomains: false,
		},
		{
			name: "ordinary route metadata",
			fetchRoutes: true,
			fetchCustomDomains: false,
		},
		{
			name: "custom-domain metadata",
			fetchRoutes: false,
			fetchCustomDomains: true,
		},
	] satisfies {
		name: string;
		fetchRoutes: boolean;
		fetchCustomDomains: boolean;
	}[])("fetches $name", async (testCase, { expect }) => {
		await fetchWorkerConfig(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			"account-id",
			"worker-name",
			"production",
			testCase.fetchRoutes,
			testCase.fetchCustomDomains
		);

		const resources = fetchResult.mock.calls.map(([, resource]) => resource);
		expect(resources.some((resource) => resource.includes("/routes?"))).toBe(
			testCase.fetchRoutes
		);
		expect(
			resources.some((resource) => resource.includes("/domains/records?"))
		).toBe(testCase.fetchCustomDomains);
	});
});
