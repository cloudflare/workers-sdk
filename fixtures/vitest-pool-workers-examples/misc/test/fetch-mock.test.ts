import { fetchMock } from "cloudflare:test";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import type { MockInstance } from "vitest";

beforeEach(() => fetchMock.activate());
afterEach(() => {
	fetchMock.assertNoPendingInterceptors();
	fetchMock.deactivate();
});

it("falls through to global fetch() if unmatched", async () => {
	fetchMock
		.get("https://example.com")
		.intercept({ path: "/" })
		.reply(200, "body");

	let response = await fetch("https://example.com");
	expect(response.url).toEqual("https://example.com/");
	expect(await response.text()).toBe("body");

	response = await fetch("https://example.com/bad");
	expect(response.url).toEqual("https://example.com/bad");
	expect(await response.text()).toBe("fallthrough:GET https://example.com/bad");
});

it("intercepts URLs with query parameters with repeated keys", async () => {
	fetchMock
		.get("https://example.com")
		.intercept({ path: "/foo/bar?a=1&a=2" })
		.reply(200, "body");

	let response = await fetch("https://example.com/foo/bar?a=1&a=2");
	expect(response.url).toEqual("https://example.com/foo/bar?a=1&a=2");
	expect(await response.text()).toBe("body");
});

describe("AbortSignal", () => {
	let abortSignalTimeoutMock: MockInstance;

	beforeAll(() => {
		// Fake Timers does not mock AbortSignal.timeout
		abortSignalTimeoutMock = vi
			.spyOn(AbortSignal, "timeout")
			.mockImplementation((ms: number) => {
				const controller = new AbortController();
				setTimeout(() => {
					controller.abort();
				}, ms);
				return controller.signal;
			});
	});

	afterAll(() => abortSignalTimeoutMock.mockRestore());

	beforeEach(() => vi.useFakeTimers());

	afterEach(() => vi.useRealTimers());

	it("aborts if an AbortSignal timeout is exceeded", async () => {
		fetchMock
			.get("https://example.com")
			.intercept({ path: "/" })
			.reply(200, async () => {
				await new Promise((resolve) => setTimeout(resolve, 5000));
				return "Delayed response";
			});

		const fetchPromise = fetch("https://example.com", {
			signal: AbortSignal.timeout(2000),
		});

		vi.advanceTimersByTime(10_000);
		await expect(fetchPromise).rejects.toThrowErrorMatchingInlineSnapshot(
			`[AbortError: The operation was aborted]`
		);
	});

	it("does not abort if an AbortSignal timeout is not exceeded", async () => {
		fetchMock
			.get("https://example.com")
			.intercept({ path: "/" })
			.reply(200, async () => {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				return "Delayed response";
			});

		const fetchPromise = fetch("https://example.com", {
			signal: AbortSignal.timeout(2000),
		});

		vi.advanceTimersByTime(1500);
		const response = await fetchPromise;
		expect(response.status).toStrictEqual(200);
		expect(await response.text()).toMatchInlineSnapshot(`"Delayed response"`);
	});

	it("aborts if an AbortSignal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();

		fetchMock
			.get("https://example.com")
			.intercept({ path: "/" })
			.reply(200, async () => {
				return "Delayed response";
			});

		const fetchPromise = fetch("https://example.com", {
			signal: controller.signal,
		});

		await expect(fetchPromise).rejects.toThrowErrorMatchingInlineSnapshot(
			`[AbortError: The operation was aborted]`
		);
	});
});
