import { getHostFromUrl } from "../zones";

describe("Zones", () => {
	test.each`
		pattern                              | host
		${"example.com"}                     | ${"example.com"}
		${"*.example.com"}                   | ${"example.com"}
		${"*example.com"}                    | ${"example.com"}
		${"example.com/path/name"}           | ${"example.com"}
		${"*.example.com/path/name"}         | ${"example.com"}
		${"*example.com/path/name"}          | ${"example.com"}
		${"*example.com"}                    | ${"example.com"}
		${"*/path/name"}                     | ${undefined}
		${"http://example.com"}              | ${"example.com"}
		${"http://*.example.com"}            | ${"example.com"}
		${"http://*example.com"}             | ${"example.com"}
		${"http://example.com/path/name"}    | ${"example.com"}
		${"http://*.example.com/path/name"}  | ${"example.com"}
		${"http://*example.com/path/name"}   | ${"example.com"}
		${"http://*example.com"}             | ${"example.com"}
		${"http://*/path/name"}              | ${undefined}
		${"https://example.com"}             | ${"example.com"}
		${"https://*.example.com"}           | ${"example.com"}
		${"https://*example.com"}            | ${"example.com"}
		${"https://example.com/path/name"}   | ${"example.com"}
		${"https://*.example.com/path/name"} | ${"example.com"}
		${"https://*example.com/path/name"}  | ${"example.com"}
		${"https://*example.com"}            | ${"example.com"}
		${"https://*/path/name"}             | ${undefined}
	`('getHostFromUrl("$pattern") === "$host"', ({ pattern, host }) => {
		expect(getHostFromUrl(pattern)).toBe(host);
	});
});
