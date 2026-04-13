import { describe, test } from "vitest";
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
					const fullPath = `/cdn-cgi/explorer/api${testPath}`;

					const routeName = getRouteName(fullPath);

					expect(routeName).not.toBe("unknown");
					expect(routeName).not.toContain("test-id");
				});
			}
		}
	});

	test("maps routes to expected names", ({ expect }) => {
		expect(getRouteName(`/cdn-cgi/explorer/api/storage/kv/namespaces`)).toBe(
			"kv.namespaces"
		);
	});

	test("returns unknown for unrecognized paths", ({ expect }) => {
		expect(getRouteName("/cdn-cgi/explorer/api/unknown/path")).toBe("unknown");
	});
});
