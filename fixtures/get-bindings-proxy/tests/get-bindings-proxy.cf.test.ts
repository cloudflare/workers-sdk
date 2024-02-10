import { describe, expect, it } from "vitest";
import { getBindingsProxy } from "./shared";

describe("getBindingsProxy - cf", () => {
	it("should provide mock data", async () => {
		const { cf, dispose } = await getBindingsProxy();
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

	it("should match the production runtime cf object", async () => {
		const { cf, dispose } = await getBindingsProxy();
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
