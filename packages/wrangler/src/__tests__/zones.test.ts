import { getHostFromUrl } from "../zones";

describe("Zones", () => {
	test.each`
		pattern                      | host
		${"example.com"}             | ${"example.com"}
		${"*.example.com"}           | ${"example.com"}
		${"*example.com"}            | ${"example.com"}
		${"example.com/path/name"}   | ${"example.com"}
		${"*.example.com/path/name"} | ${"example.com"}
		${"*example.com/path/name"}  | ${"example.com"}
		${"*example.com"}            | ${"example.com"}
		${"*/path/name"}             | ${undefined}
	`('getHostFromUrl("$pattern") === "$host"', ({ pattern, host }) => {
		expect(getHostFromUrl(pattern)).toBe(host);
	});
});
