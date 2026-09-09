import { describe, test } from "vitest";
import { tailEventsReplacer, tailEventsReviver } from "../tail-events";

// Mirrors how tail events are forwarded to the user worker.
function roundTrip<T>(value: unknown): T {
	return JSON.parse(
		JSON.stringify(value, tailEventsReplacer),
		tailEventsReviver
	);
}

describe("tail event serialization", () => {
	test("restores a Date", ({ expect }) => {
		const scheduledTime = new Date("2025-05-01T12:34:56.000Z");

		const result = roundTrip<{ event: { scheduledTime: Date } }>({
			event: { scheduledTime },
		});

		expect(result.event.scheduledTime).toBeInstanceOf(Date);
		expect(result.event.scheduledTime.getTime()).toBe(scheduledTime.getTime());
	});

	test("restores a Date nested in an array", ({ expect }) => {
		const date = new Date("2025-05-01T12:34:56.000Z");

		const [item] = roundTrip<[{ date: Date }]>([{ date }]);

		expect(item.date).toBeInstanceOf(Date);
		expect(item.date.getTime()).toBe(date.getTime());
	});

	test("restores a Date returned by a custom toJSON()", ({ expect }) => {
		const date = new Date("2025-05-01T12:34:56.000Z");

		const result = roundTrip<{ value: Date }>({
			value: {
				toJSON() {
					return date;
				},
			},
		});

		expect(result.value).toBeInstanceOf(Date);
		expect(result.value.getTime()).toBe(date.getTime());
	});

	test("restores a bigint", ({ expect }) => {
		const result = roundTrip<{ value: bigint }>({
			value: 9007199254740993n,
		});

		expect(result.value).toBe(9007199254740993n);
	});

	test("restores a bigint published on a diagnostics channel", ({ expect }) => {
		// `TraceDiagnosticChannelEvent.message` is typed `any`, so anything a
		// worker publishes lands here — including a bigint, which
		// `JSON.stringify()` throws on rather than dropping.
		const result = roundTrip<{
			diagnosticsChannelEvents: [{ channel: string; message: bigint }];
		}>({
			diagnosticsChannelEvents: [{ channel: "test", message: 5n }],
		});

		expect(result.diagnosticsChannelEvents[0].message).toBe(5n);
	});

	test("leaves a date-like string alone", ({ expect }) => {
		const result = roundTrip<{ message: string }>({
			message: "2025-05-01T12:34:56.000Z",
		});

		expect(result.message).toBe("2025-05-01T12:34:56.000Z");
	});

	test("does not throw on an invalid Date", ({ expect }) => {
		const result = roundTrip<{ scheduledTime: null }>({
			scheduledTime: new Date(NaN),
		});

		expect(result.scheduledTime).toBe(null);
	});

	test("revives a payload that already contains the date tag", ({ expect }) => {
		// The tag is a plain object key, so a payload that happens to contain it
		// is indistinguishable from a serialized Date. Pinned here so the
		// collision stays a known trade-off.
		const result = roundTrip<{ logged: Date }>({
			logged: { ___serialized_date___: "2025-05-01T12:34:56.000Z" },
		});

		expect(result.logged).toBeInstanceOf(Date);
	});

	test("revives a payload that already contains the bigint tag", ({
		expect,
	}) => {
		// Same known trade-off as the date tag above.
		const result = roundTrip<{ logged: bigint }>({
			logged: { ___serialized_bigint___: "5" },
		});

		expect(result.logged).toBe(5n);
	});

	test("leaves a malformed bigint tag alone", ({ expect }) => {
		// `BigInt("not a number")` throws, so the tag has to be tolerated rather
		// than trusted — otherwise reviving is itself a way to fail the parse.
		const result = roundTrip<{ logged: Record<string, string> }>({
			logged: { ___serialized_bigint___: "not a number" },
		});

		expect(result.logged).toEqual({ ___serialized_bigint___: "not a number" });
	});
});
