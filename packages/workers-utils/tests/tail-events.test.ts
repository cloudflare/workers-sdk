import { describe, test } from "vitest";
import { tailEventsReplacer, tailEventsReviver } from "../src/tail-events";

// Mirrors how tail events are forwarded between dev sessions.
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
		// worker publishes lands here, including a bigint, which
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

	test("keeps a payload that uses the date tag as a key", ({ expect }) => {
		const logged = {
			___serialized_date___: "2025-05-01T12:34:56.000Z",
			level: "info",
		};

		const result = roundTrip<{ logged: typeof logged }>({ logged });

		expect(result.logged).toEqual(logged);
	});

	test("keeps a payload that is exactly the bigint tag shape", ({ expect }) => {
		const result = roundTrip<{ logged: Record<string, string> }>({
			logged: { ___serialized_bigint___: "5" },
		});

		expect(result.logged).toEqual({ ___serialized_bigint___: "5" });
	});

	test("keeps a payload whose key is already escaped", ({ expect }) => {
		const logged = {
			"~___serialized_date___": "a",
			"~~___serialized_bigint___": "b",
		};

		const result = roundTrip<{ logged: typeof logged }>({ logged });

		expect(result.logged).toEqual(logged);
	});

	test("keeps a Date inside a payload that uses a tag as a key", ({
		expect,
	}) => {
		const date = new Date("2025-05-01T12:34:56.000Z");

		const result = roundTrip<{
			logged: { ___serialized_date___: string; at: Date };
		}>({
			logged: { ___serialized_date___: "x", at: date },
		});

		expect(result.logged.___serialized_date___).toBe("x");
		expect(result.logged.at).toBeInstanceOf(Date);
		expect(result.logged.at.getTime()).toBe(date.getTime());
	});

	test("reads tags written by a dev session that doesn't escape keys", ({
		expect,
	}) => {
		const result = JSON.parse(
			'{"at":{"___serialized_date___":"2025-05-01T12:34:56.000Z"},"n":{"___serialized_bigint___":"5"}}',
			tailEventsReviver
		);

		expect(result.at).toBeInstanceOf(Date);
		expect(result.n).toBe(5n);
	});

	test("leaves a malformed bigint tag alone", ({ expect }) => {
		const result = JSON.parse(
			'{"logged":{"___serialized_bigint___":"not a number"}}',
			tailEventsReviver
		);

		expect(result.logged).toEqual({ ___serialized_bigint___: "not a number" });
	});
});
