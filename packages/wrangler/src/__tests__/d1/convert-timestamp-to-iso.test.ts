import { convertTimestampToISO } from "../../d1/timeTravel/utils";

describe("convertTimestampToISO", () => {
	beforeAll(() => {
		jest.useFakeTimers();
		//lock time to 2023-08-01 UTC
		jest.setSystemTime(new Date(2023, 7, 1));
	});

	afterAll(() => {
		jest.useRealTimers();
	});

	it("should reject invalid date strings", () => {
		const timestamp = "asdf";
		let error = "";
		try {
			convertTimestampToISO(timestamp);
		} catch (e) {
			error = `${e}`.replace(
				/\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\d(\+|-)\d\d:\d\d/,
				"(DATE)"
			);
		}
		expect(error).toMatchInlineSnapshot(`
		"Error: Invalid timestamp 'asdf'. Please provide a valid Unix timestamp or ISO string, for example: (DATE)
		For accepted format, see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date#date_time_string_format"
	`);
	});

	it("should convert a JS timestamp to an ISO string", () => {
		const now = +new Date();
		const converted = convertTimestampToISO(String(now));
		expect(converted).toEqual(new Date(now).toISOString());
	});

	it("should automagically convert a unix timestamp to an ISO string", () => {
		const date = "1689355284"; // 2023-07-14T17:21:24.000Z
		const convertedDate = new Date(1689355284000);
		const output = convertTimestampToISO(String(date));
		expect(output).toEqual(convertedDate.toISOString());
	});

	it("should reject unix timestamps older than 30 days", () => {
		const timestamp = "1626168000";
		expect(() =>
			convertTimestampToISO(timestamp)
		).toThrowErrorMatchingInlineSnapshot(
			`"Invalid timestamp '1626168000'. Please provide a timestamp within the last 30 days"`
		);
	});

	it("should reject JS timestamps from the future", () => {
		const date = String(+new Date() + 10000);

		let error = "";
		try {
			convertTimestampToISO(date);
		} catch (e) {
			error = `${e}`.replace(/\d+/, "(TIMESTAMP)");
		}
		expect(error).toMatchInlineSnapshot(
			`"Error: Invalid timestamp '(TIMESTAMP)'. Please provide a timestamp in the past"`
		);
	});

	it("should return an ISO string when provided an ISO string", () => {
		const date = "2023-07-15T11:45:11.522Z";

		const iso = convertTimestampToISO(date);
		expect(iso).toEqual(date);
	});

	it("should reject ISO strings older than 30 days", () => {
		const date = "1975-07-17T11:45:11.522Z";

		expect(() =>
			convertTimestampToISO(date)
		).toThrowErrorMatchingInlineSnapshot(
			`"Invalid timestamp '1975-07-17T11:45:11.522Z'. Please provide a timestamp within the last 30 days"`
		);
	});

	it("should reject ISO strings from the future", () => {
		// TODO: fix Y3k bug
		const date = "3000-01-01T00:00:00.001Z";

		expect(() =>
			convertTimestampToISO(date)
		).toThrowErrorMatchingInlineSnapshot(
			`"Invalid timestamp '3000-01-01T00:00:00.001Z'. Please provide a timestamp in the past"`
		);
	});
});
