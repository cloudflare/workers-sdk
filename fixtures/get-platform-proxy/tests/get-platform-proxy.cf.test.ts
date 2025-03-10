import path from "path";
import { describe, expect, it } from "vitest";
import { getPlatformProxy } from "./shared";

const tomlWithDO = path.join(__dirname, "..", "wrangler.do.toml");

describe.each([
	{ name: "script with no exports", configPath: undefined },
	{ name: "script with DO, useMain = true ", configPath: tomlWithDO },
])("cf: $name", ({ configPath }) => {
	it("should provide mock data", async () => {
		const proxy = configPath
			? await getPlatformProxy({ configPath, exportsPath: { useMain: true } })
			: await getPlatformProxy();
		try {
			expect(proxy.cf).toMatchObject({
				colo: "DFW",
				city: "Austin",
				regionCode: "TX",
			});
		} finally {
			await proxy.dispose();
		}
	});

	it("should match the production runtime cf object", async () => {
		const proxy = configPath
			? await getPlatformProxy({ configPath, exportsPath: { useMain: true } })
			: await getPlatformProxy();

		try {
			expect(proxy.cf.constructor.name).toBe("Object");

			expect(() => {
				proxy.cf.city = "test city";
			}).toThrowError(
				"Cannot assign to read only property 'city' of object '#<Object>'"
			);
			expect(proxy.cf.city).not.toBe("test city");

			expect(() => {
				proxy.cf.newField = "test new field";
			}).toThrowError("Cannot add property newField, object is not extensible");
			expect("newField" in proxy.cf).toBe(false);

			expect(proxy.cf.botManagement).toMatchObject({
				score: 99,
			});
			expect(Object.isFrozen(proxy.cf.botManagement)).toBe(true);
		} finally {
			await proxy.dispose();
		}
	});
});
