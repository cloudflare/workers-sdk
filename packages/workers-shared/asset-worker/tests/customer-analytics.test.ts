import { describe, it, vi } from "vitest";
import { CustomerAnalytics } from "../src/customer-analytics";
import type { ReadyAnalyticsEvent } from "../src/types";

describe("[Asset Worker] Customer Analytics", () => {
	it("writes only the customer-facing request fields", ({ expect }) => {
		let captured: ReadyAnalyticsEvent | undefined;
		const analytics = new CustomerAnalytics({
			logEvent: vi.fn((event: ReadyAnalyticsEvent) => {
				captured = event;
			}),
		});

		analytics.setData({
			accountId: 123,
			scriptId: 456,
			coloId: 789,
			status: 200,
			hostname: "example.com",
			cacheStatus: "HIT",
			scriptVersionId: "01234567-89ab-cdef-0123-456789abcdef",
		});
		analytics.write();

		expect(captured).toEqual({
			version: 1,
			accountId: 123,
			indexId: "456",
			doubles: [undefined, 789, undefined, undefined, 200],
			blobs: [
				"example.com",
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				"HIT",
				undefined,
				undefined,
				undefined,
				"01234567-89ab-cdef-0123-456789abcdef",
			],
		});
	});
});
