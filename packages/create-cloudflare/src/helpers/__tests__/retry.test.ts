import { retry } from "helpers/retry";
import { describe, expect, test } from "vitest";

describe("retry", () => {
	test("success on first try", async () => {
		let tries = 0;
		await retry({ times: 3 }, async () => {
			tries++;
			return Promise.resolve(true);
		});
		expect(tries).toBe(1);
	});

	test("success after one failure", async () => {
		let tries = 0;
		await retry({ times: 3 }, async () => {
			tries++;
			if (tries > 1) {
				return Promise.resolve(true);
			}
			throw Error();
		});
		expect(tries).toBe(2);
	});

	test("success after multiple failures", async () => {
		let tries = 0;
		let fails = 2;

		await retry({ times: 3 }, async () => {
			tries++;
			if (fails === 0) {
				return Promise.resolve(true);
			}

			fails--;
			throw Error();
		});
		expect(tries).toBe(3);
	});

	test("hard failure", async () => {
		await expect(async () => {
			await retry({ times: 3 }, async () => {
				throw Error("testing");
			});
		}).rejects.toThrowError("testing");
	});

	test("exit condition encountered", async () => {
		let tries = 0;

		await expect(async () => {
			await retry(
				{
					times: 3,
					exitCondition: (e) =>
						e instanceof Error && e.message == "special condition",
				},
				async () => {
					if (tries < 1) {
						tries++;
						throw Error("error");
					}
					throw Error("special condition");
				}
			);
		}).rejects.toThrowError("special condition");
	});
});
