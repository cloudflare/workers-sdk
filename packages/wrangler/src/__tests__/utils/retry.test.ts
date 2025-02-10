import { APIError } from "../../parse";
import { retryOnAPIFailure } from "../../utils/retry";
import { mockConsoleMethods } from "../helpers/mock-console";

describe("retryOnAPIFailure", () => {
	const std = mockConsoleMethods();

	it("should retry 5xx errors and succeed if the 3rd try succeeds", async () => {
		let attempts = 0;

		await retryOnAPIFailure(() => {
			attempts++;
			if (attempts < 3) {
				throw new APIError({ status: 500, text: "500 error" });
			}
		});
		expect(attempts).toBe(3);
		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "Retrying API call after error...
			Retrying API call after error...",
			  "out": "",
			  "warn": "",
			}
		`);
	});

	it("should throw 5xx error after all retries fail", async () => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new APIError({ status: 500, text: "500 error" });
			})
		).rejects.toMatchInlineSnapshot(`[APIError: 500 error]`);
		expect(attempts).toBe(3);
		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "Retrying API call after error...
			Retrying API call after error...
			Retrying API call after error...",
			  "out": "",
			  "warn": "",
			}
		`);
	});

	it("should not retry non-5xx errors", async () => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new APIError({ status: 401, text: "401 error" });
			})
		).rejects.toMatchInlineSnapshot(`[APIError: 401 error]`);
		expect(attempts).toBe(1);
		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "",
			  "warn": "",
			}
		`);
	});

	it("should retry TypeError", async () => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new TypeError("type error");
			})
		).rejects.toMatchInlineSnapshot(`[TypeError: type error]`);
		expect(attempts).toBe(3);
		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "Retrying API call after error...
			Retrying API call after error...
			Retrying API call after error...",
			  "out": "",
			  "warn": "",
			}
		`);
	});

	it("should not retry other errors", async () => {
		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new Error("some error");
			})
		).rejects.toMatchInlineSnapshot(`[Error: some error]`);
		expect(attempts).toBe(1);
		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "",
			  "out": "",
			  "warn": "",
			}
		`);
	});

	it("should retry custom APIError implementation with non-5xx error", async () => {
		let checkedCustomIsRetryable = false;
		class CustomAPIError extends APIError {
			isRetryable(): boolean {
				checkedCustomIsRetryable = true;
				return true;
			}
		}

		let attempts = 0;

		await expect(() =>
			retryOnAPIFailure(() => {
				attempts++;
				throw new CustomAPIError({ status: 401, text: "401 error" });
			})
		).rejects.toMatchInlineSnapshot(`[CustomAPIError: 401 error]`);
		expect(attempts).toBe(3);
		expect(checkedCustomIsRetryable).toBe(true);
		expect(std).toMatchInlineSnapshot(`
			Object {
			  "debug": "",
			  "err": "",
			  "info": "Retrying API call after error...
			Retrying API call after error...
			Retrying API call after error...",
			  "out": "",
			  "warn": "",
			}
		`);
	});
});
