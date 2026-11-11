import { test, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));

import {
	tailEventsReplacer,
	tailEventsReviver,
	// @ts-expect-error worker-typed source is excluded from the node-side tsconfig
} from "../../../src/workers/core/dev-registry-proxy-shared.worker";

function roundTrip<T>(value: T): T {
	return JSON.parse(JSON.stringify(value, tailEventsReplacer), tailEventsReviver);
}

test("tail events replacer/reviver round-trips Date values", ({ expect }) => {
	const result = roundTrip({ scheduledTime: new Date(0) });
	expect(result.scheduledTime).toBeInstanceOf(Date);
	expect(result.scheduledTime.getTime()).toBe(0);
});

test("tail events replacer/reviver round-trips nested Dates", ({ expect }) => {
	const date = new Date("2025-05-01T12:34:56.000Z");
	const result = roundTrip({ events: [{ eventInfo: { scheduledTime: date } }] });
	expect(result.events[0].eventInfo.scheduledTime).toBeInstanceOf(Date);
	expect(result.events[0].eventInfo.scheduledTime.getTime()).toBe(date.getTime());
});

test("tail events replacer/reviver round-trips bigint values", ({ expect }) => {
	expect(roundTrip({ n: 123n }).n).toBe(123n);
});
