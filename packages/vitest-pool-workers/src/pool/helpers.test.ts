import { describe, expect, it, vi } from "vitest";
import { Semaphore } from "./helpers";

describe("Semaphore", () => {
	it("should initialise with the correct maximum resources", () => {
		const maxResources = 5;
		const pool = new Semaphore(maxResources);

		expect(pool.availableResourcesCount).toEqual(maxResources);
	});

	it("should return the result of the callback function from runWith", async () => {
		const limiter = new Semaphore(1);
		const fn = vi.fn(() => Promise.resolve("result"));

		const result = await limiter.runWith(fn);

		expect(result).toEqual("result");
	});

	it("should queue functions when max resources are reached", async () => {
		const limiter = new Semaphore(2);
		const fn1 = vi.fn(() => Promise.resolve("result1"));
		const fn2 = vi.fn(() => Promise.resolve("result2"));
		const fn3 = vi.fn(() => Promise.resolve("result3"));

		void limiter.runWith(fn1);
		void limiter.runWith(fn2);
		const result3 = limiter.runWith(fn3);

		expect(fn1).toHaveBeenCalled();
		expect(fn2).toHaveBeenCalled();
		expect(fn3).not.toHaveBeenCalled();

		await result3;

		expect(fn3).toHaveBeenCalled();
	});

	it("should execute queued functions in the correct order", async () => {
		const limiter = new Semaphore(2);
		const logs = [] as number[];
		const fn1 = vi.fn(() => {
			logs.push(1);
			return Promise.resolve("result1");
		});
		const fn2 = vi.fn(() => {
			logs.push(2);
			return Promise.resolve("result2");
		});
		const fn3 = vi.fn(() => {
			logs.push(3);
			return Promise.resolve("result3");
		});

		void limiter.runWith(fn1);
		void limiter.runWith(fn2);
		const result3 = limiter.runWith(fn3);

		await result3;

		expect(logs).toEqual([1, 2, 3]);
	});

	it("should handle rejected promises correctly", async () => {
		const limiter = new Semaphore(1);
		const errorMessage = "Rejected promise";

		const fn1 = vi.fn(() => Promise.reject(new Error(errorMessage)));
		const fn2 = vi.fn(() => Promise.resolve());

		const result1 = limiter.runWith(fn1);
		const result2 = limiter.runWith(fn2);

		await expect(result1).rejects.toThrow(errorMessage);
		await expect(result2).resolves.toBeUndefined();

		expect(fn1).toHaveBeenCalled();
		expect(fn2).toHaveBeenCalled();
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
			expect(() => new Semaphore(value)).toThrowError(
				"maxResources argument must be a positive integer"
			);
		});
	});
});
