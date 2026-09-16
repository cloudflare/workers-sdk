import { describe, test } from "vitest";
import { ANALYTICS_SQL_PLUGIN, ProxyNodeBinding } from "miniflare";

function workerOptions(bindings = true) {
	return {
		config: {
			env: bindings
				? {
						ANALYTICS: { type: "analytics-sql" },
						SECOND_ANALYTICS: { type: "analytics-sql" },
					}
				: {},
		},
	} as unknown as Parameters<typeof ANALYTICS_SQL_PLUGIN.getBindings>[0];
}

describe("Analytics SQL plugin", () => {
	test("creates service bindings for every configured binding", async ({
		expect,
	}) => {
		const bindings = await ANALYTICS_SQL_PLUGIN.getBindings(
			workerOptions(),
			{} as Parameters<typeof ANALYTICS_SQL_PLUGIN.getBindings>[1],
			0
		);

		expect(bindings).toHaveLength(2);
		expect(bindings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "ANALYTICS" }),
				expect.objectContaining({ name: "SECOND_ANALYTICS" }),
			])
		);
		for (const binding of bindings ?? []) {
			expect(binding).toMatchObject({
				service: { name: "analytics-sql:remote" },
			});
		}
	});

	test("creates Node proxy bindings", async ({ expect }) => {
		const bindings =
			await ANALYTICS_SQL_PLUGIN.getNodeBindings(workerOptions());

		expect(Object.keys(bindings)).toEqual(["ANALYTICS", "SECOND_ANALYTICS"]);
		expect(bindings.ANALYTICS).toBeInstanceOf(ProxyNodeBinding);
		expect(bindings.SECOND_ANALYTICS).toBeInstanceOf(ProxyNodeBinding);
	});

	test("creates one shared remote service only when configured", async ({
		expect,
	}) => {
		const services = await ANALYTICS_SQL_PLUGIN.getServices({
			options: workerOptions(),
		} as Parameters<typeof ANALYTICS_SQL_PLUGIN.getServices>[0]);
		const emptyServices = await ANALYTICS_SQL_PLUGIN.getServices({
			options: workerOptions(false),
		} as Parameters<typeof ANALYTICS_SQL_PLUGIN.getServices>[0]);

		expect(services).toEqual([
			expect.objectContaining({
				name: "analytics-sql:remote",
				worker: expect.objectContaining({
					compatibilityDate: "2025-01-01",
				}),
			}),
		]);
		expect(emptyServices).toEqual([]);
	});
});
