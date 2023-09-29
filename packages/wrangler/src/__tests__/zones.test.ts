import { getHostFromUrl } from "../zones";

describe("Zones", () => {
	describe("getHostFromUrl", () => {
		test.each`
			pattern                                             | host
			${"rootdomain.com"}                                 | ${"rootdomain.com"}
			${"*.subdomain.com"}                                | ${"subdomain.com"}
			${"*rootdomain-or-subdomain.com"}                   | ${"rootdomain-or-subdomain.com"}
			${"rootdomain.com/path/name"}                       | ${"rootdomain.com"}
			${"*.subdomain.com/path/name"}                      | ${"subdomain.com"}
			${"*rootdomain-or-subdomain.com/path/name"}         | ${"rootdomain-or-subdomain.com"}
			${"*rootdomain-or-subdomain.com"}                   | ${"rootdomain-or-subdomain.com"}
			${"*/path/name"}                                    | ${undefined}
			${"http://rootdomain.com"}                          | ${"rootdomain.com"}
			${"http://*.subdomain.com"}                         | ${"subdomain.com"}
			${"http://*rootdomain-or-subdomain.com"}            | ${"rootdomain-or-subdomain.com"}
			${"http://rootdomain.com/path/name"}                | ${"rootdomain.com"}
			${"http://*.subdomain.com/path/name"}               | ${"subdomain.com"}
			${"http://*rootdomain-or-subdomain.com/path/name"}  | ${"rootdomain-or-subdomain.com"}
			${"http://*rootdomain-or-subdomain.com"}            | ${"rootdomain-or-subdomain.com"}
			${"http://*/path/name"}                             | ${undefined}
			${"https://rootdomain.com"}                         | ${"rootdomain.com"}
			${"https://*.subdomain.com"}                        | ${"subdomain.com"}
			${"https://*rootdomain-or-subdomain.com"}           | ${"rootdomain-or-subdomain.com"}
			${"https://rootdomain.com/path/name"}               | ${"rootdomain.com"}
			${"https://*.subdomain.com/path/name"}              | ${"subdomain.com"}
			${"https://*rootdomain-or-subdomain.com/path/name"} | ${"rootdomain-or-subdomain.com"}
			${"https://*rootdomain-or-subdomain.com"}           | ${"rootdomain-or-subdomain.com"}
			${"https://*/path/name"}                            | ${undefined}
		`("$pattern --> $host", ({ pattern, host }) => {
			expect(getHostFromUrl(pattern)).toBe(host);
		});
	});
});
