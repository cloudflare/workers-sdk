import { setTimeout } from "node:timers/promises";
import {
	alsAttemptCounter,
	ExponentialBackoff,
	LinearBackoff,
	retryOnError,
} from "../../utils/retry";

const countTo = (n: number): number[] =>
	Array.from({ length: n }, (_, i) => i + 1); // [1, 2, ..., n]

describe("retryOnError", () => {
	beforeEach(() => {
		vi.mock("node:timers/promises", async () => {
			const mockSetTimeout = vi.fn();
			mockSetTimeout.mockImplementation(async () => {
				return Promise.resolve(null);
			});
			return { setTimeout: mockSetTimeout };
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("[sync] it retries an action the maxAttempts times", async () => {
		const alsAttempts: (number | undefined)[] = [];
		let actualAttemptCount = 0;
		const result = retryOnError(() => {
			actualAttemptCount += 1;
			const reportedAttemptCount = alsAttemptCounter.getStore();
			expect(reportedAttemptCount).toBe(actualAttemptCount);
			alsAttempts.push(reportedAttemptCount);
			throw new Error("bang");
		}, 5);
		await expect(result).rejects.toThrow("bang");
		expect(actualAttemptCount).toBe(5);
		expect(alsAttempts).toEqual(countTo(5));
	});

	test("[async] it retries an action the maxAttempts times", async () => {
		const alsAttempts: (number | undefined)[] = [];
		let actualAttemptCount = 0;
		const result = retryOnError(async () => {
			actualAttemptCount += 1;
			const reportedAttemptCount = alsAttemptCounter.getStore();
			expect(reportedAttemptCount).toBe(actualAttemptCount);
			alsAttempts.push(reportedAttemptCount);
			throw new Error("bang");
		}, 5);
		await expect(result).rejects.toThrow("bang");
		expect(actualAttemptCount).toBe(5);
		expect(alsAttempts).toEqual(countTo(5));
	});

	test("exits early on success", async () => {
		let actualAttemptCount = 0;
		const result = retryOnError(() => {
			actualAttemptCount += 1;
			if (actualAttemptCount === 3) {
				return "success";
			}
			throw new Error("bang");
		}, 5);
		await expect(result).resolves.toEqual("success");
		expect(actualAttemptCount).toBe(3);
	});

	test("constant backoff", async () => {
		await expect(
			retryOnError(() => {
				throw new Error("bang");
			}, 5)
		).rejects.toThrow("bang");
		expect(setTimeout).toHaveBeenNthCalledWith(1, 2000);
		expect(setTimeout).toHaveBeenNthCalledWith(2, 2000);
		expect(setTimeout).toHaveBeenNthCalledWith(3, 2000);
		expect(setTimeout).toHaveBeenNthCalledWith(4, 2000);
	});

	test("linear backoff", async () => {
		await expect(
			retryOnError(
				() => {
					throw new Error("bang");
				},
				5,
				{ strategy: LinearBackoff }
			)
		).rejects.toThrow("bang");
		expect(setTimeout).toHaveBeenNthCalledWith(1, 2000);
		expect(setTimeout).toHaveBeenNthCalledWith(2, 4000);
		expect(setTimeout).toHaveBeenNthCalledWith(3, 6000);
		expect(setTimeout).toHaveBeenNthCalledWith(4, 8000);
	});

	test("exponential backoff", async () => {
		await expect(
			retryOnError(
				() => {
					throw new Error("bang");
				},
				5,
				{ strategy: ExponentialBackoff }
			)
		).rejects.toThrow("bang");
		expect(setTimeout).toHaveBeenNthCalledWith(1, 2000);
		expect(setTimeout).toHaveBeenNthCalledWith(2, 4000);
		expect(setTimeout).toHaveBeenNthCalledWith(3, 8000);
		expect(setTimeout).toHaveBeenNthCalledWith(4, 16000);
	});
});
