import { fetchMock } from "cloudflare:test";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	it,
	vi,
} from "vitest";
import type { MockInstance } from "vitest";

beforeEach(() => fetchMock.activate());
afterEach(() => {
	fetchMock.assertNoPendingInterceptors();
	fetchMock.deactivate();
});

it("falls through to global fetch() if unmatched", async ({ expect }) => {
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

it("intercepts URLs with query parameters with repeated keys", async ({
	expect,
}) => {
	fetchMock
		.get("https://example.com")
		.intercept({ path: "/foo", query: { key: "value" } })
		.reply(200, "foo");

	fetchMock
		.get("https://example.com")
		.intercept({ path: "/bar?a=1&a=2" })
		.reply(200, "bar");

	fetchMock
		.get("https://example.com")
		.intercept({ path: "/baz", query: { key1: ["a", "b"], key2: "c" } })
		.reply(200, "baz");

	let response1 = await fetch("https://example.com/foo?key=value");
	expect(response1.url).toEqual("https://example.com/foo?key=value");
	expect(await response1.text()).toBe("foo");

	let response2 = await fetch("https://example.com/bar?a=1&a=2");
	expect(response2.url).toEqual("https://example.com/bar?a=1&a=2");
	expect(await response2.text()).toBe("bar");

	let response3 = await fetch("https://example.com/baz?key1=a&key2=c&key1=b");
	expect(response3.url).toEqual("https://example.com/baz?key1=a&key2=c&key1=b");
	expect(await response3.text()).toBe("baz");
});

it("throws if you try to mutate the headers", async ({ expect }) => {
	fetchMock
		.get("https://example.com")
		.intercept({ path: "/" })
		.reply(200, "body");

	let response = await fetch("https://example.com");

	expect(() => response.headers.set("foo", "bar")).toThrowError();
	expect(() => response.headers.append("foo", "baz")).toThrowError();
	expect(() => response.headers.delete("foo")).toThrowError();
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

	it("aborts if an AbortSignal timeout is exceeded", async ({ expect }) => {
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

	it("does not abort if an AbortSignal timeout is not exceeded", async ({
		expect,
	}) => {
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

	it("aborts if an AbortSignal is already aborted", async ({ expect }) => {
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
