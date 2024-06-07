import { describe, expect, it } from "vitest";
import { ResourcePool } from "./helpers";

describe("ResourcePool", () => {
	it("should initialize with the correct maximum resources", () => {
		const maxResources = 5;
		const pool = new ResourcePool(maxResources);

		expect(pool.availableResourcesCount).toEqual(maxResources);
	});

	it("should return the correct number of available resources", async () => {
		const maxResources = 3;
		const pool = new ResourcePool(maxResources);

		expect(pool.availableResourcesCount).toEqual(maxResources);

		await pool.nextAvailableResource();
		expect(pool.availableResourcesCount).toEqual(maxResources - 1);

		await pool.nextAvailableResource();
		expect(pool.availableResourcesCount).toEqual(maxResources - 2);
	});

	it("should allocate resources when available", async () => {
		const maxResources = 2;
		const pool = new ResourcePool(maxResources);

		await pool.nextAvailableResource();
		await pool.nextAvailableResource();
		expect(pool.queueSize).toEqual(0);

		const promise = pool.nextAvailableResource();
		expect(pool.queueSize).toEqual(1);

		pool.releaseResource();
		await promise;

		expect(pool.queueSize).toEqual(0);
		expect(pool.availableResourcesCount).toEqual(0);
	});

	it("should release resources and allocate them to queued requests", async () => {
		const maxResources = 2;
		const pool = new ResourcePool(maxResources);

		await pool.nextAvailableResource();
		await pool.nextAvailableResource();
		const promise = pool.nextAvailableResource();
		expect(pool.queueSize).toEqual(1);

		pool.releaseResource();
		await promise;
		expect(pool.queueSize).toEqual(0);
	});

	it("should handle multiple queued requests", async () => {
		const maxResources = 2;
		const pool = new ResourcePool(maxResources);

		await pool.nextAvailableResource();
		await pool.nextAvailableResource();
		const promise1 = pool.nextAvailableResource();
		const promise2 = pool.nextAvailableResource();
		const promise3 = pool.nextAvailableResource();
		expect(pool.queueSize).toEqual(3);

		pool.releaseResource();
		await promise1;
		expect(pool.queueSize).toEqual(2);

		pool.releaseResource();
		await promise2;
		expect(pool.queueSize).toEqual(1);

		pool.releaseResource();
		await promise3;
		expect(pool.queueSize).toEqual(0);
	});

	it("should not release resources when no requests are queued", async () => {
		const maxResources = 2;
		const pool = new ResourcePool(maxResources);

		await pool.nextAvailableResource();
		await pool.nextAvailableResource();
		expect(pool.queueSize).toEqual(0);

		pool.releaseResource();
		expect(pool.queueSize).toEqual(0);
	});

	describe("invalid maxResources argument", () => {
		it.each([
			[0],
			[-1],
			[Infinity],
			[-Infinity],
			["string"],
			[true],
			[{}],
			[[]],
			[NaN],
		])("should throw if %s provided as argument", (value) => {
			// @ts-expect-error testing invalid values
			expect(() => new ResourcePool(value)).toThrowError(
				"maxResources argument must be a positive integer"
			);
		});
	});
});
