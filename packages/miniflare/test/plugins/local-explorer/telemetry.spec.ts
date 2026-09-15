import { describe, test } from "vitest";
import {
	EXPLORER_REFRESH_HEADER,
	isAutomaticWorkersRefresh,
} from "../../../src/workers/local-explorer/explorer-refresh";
import openApiSpec from "../../../src/workers/local-explorer/openapi.local.json";
import { getRouteName } from "../../../src/workers/local-explorer/route-names";

describe("getRouteName", () => {
	describe("covers all OpenAPI routes", () => {
		const paths = Object.entries(openApiSpec.paths) as [
			string,
			Record<string, unknown>,
		][];

		for (const [path, methodsObj] of paths) {
			const methods = Object.keys(methodsObj);
			for (const method of methods) {
				test(`handles ${method.toUpperCase()} ${path}`, ({ expect }) => {
					// Replace {param} placeholders with dummy values
					const testPath = path.replace(/\{[^}]+\}/g, "test-id");
					const fullPath = `/cdn-cgi/local/explorer/api${testPath}`;

					const routeName = getRouteName(fullPath);

					expect(routeName).not.toBe("unknown");
					expect(routeName).not.toContain("test-id");
				});
			}
		}
	});

	test("maps routes to expected names", ({ expect }) => {
		expect(
			getRouteName(`/cdn-cgi/local/explorer/api/storage/kv/namespaces`)
		).toBe("kv.namespaces");
	});

	test("returns unknown for unrecognized paths", ({ expect }) => {
		expect(getRouteName("/cdn-cgi/local/explorer/api/unknown/path")).toBe(
			"unknown"
		);
	});
});

describe("automatic workers refresh telemetry", () => {
	test("skips only poll refreshes of GET /local/workers", ({ expect }) => {
		expect(EXPLORER_REFRESH_HEADER).toBe("X-Miniflare-Explorer-Refresh");
		expect(isAutomaticWorkersRefresh("GET", "local.workers", "poll")).toBe(
			true
		);
		expect(isAutomaticWorkersRefresh("POST", "local.workers", "poll")).toBe(
			false
		);
		expect(isAutomaticWorkersRefresh("GET", "scheduled.dispatch", "poll")).toBe(
			false
		);
		expect(isAutomaticWorkersRefresh("GET", "local.workers", "manual")).toBe(
			false
		);
		expect(isAutomaticWorkersRefresh("GET", "local.workers", undefined)).toBe(
			false
		);
	});
});
