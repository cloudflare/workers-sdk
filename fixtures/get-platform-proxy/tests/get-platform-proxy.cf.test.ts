import { describe, it } from "vitest";
import { getPlatformProxy } from "./shared";

describe("getPlatformProxy - cf", () => {
	it("should provide mock data", async ({ expect }) => {
		const { cf, dispose } = await getPlatformProxy();
		try {
			expect(cf).toMatchObject({
				colo: "DFW",
				city: "Austin",
				regionCode: "TX",
			});
		} finally {
			await dispose();
		}
	});

	it("should match the production runtime cf object", async ({ expect }) => {
		const { cf, dispose } = await getPlatformProxy();
		try {
			expect(cf.constructor.name).toBe("Object");

			expect(() => {
				cf.city = "test city";
			}).toThrowError(
				"Cannot assign to read only property 'city' of object '#<Object>'"
			);
			expect(cf.city).not.toBe("test city");

			expect(() => {
				cf.newField = "test new field";
			}).toThrowError("Cannot add property newField, object is not extensible");
			expect("newField" in cf).toBe(false);

			expect(cf.botManagement).toMatchObject({
				score: 99,
			});
			expect(Object.isFrozen(cf.botManagement)).toBe(true);
		} finally {
			await dispose();
		}
	});
});
