import { test } from "vitest";
import { parseForwardedProto } from "../../src/shared/forwarded-proto";

test.for([
	{ value: undefined, expected: undefined },
	{ value: null, expected: undefined },
	{ value: "", expected: undefined },
	{ value: "http", expected: "http:" },
	{ value: "https", expected: "https:" },
	{ value: " HTTPS ", expected: "https:" },
	{ value: "https, http", expected: "https:" },
	{ value: "http, https", expected: "http:" },
	{ value: "ws", expected: undefined },
	{ value: "invalid, https", expected: undefined },
])("parseForwardedProto: $value", ({ value, expected }, { expect }) => {
	expect(parseForwardedProto(value)).toBe(expected);
});
