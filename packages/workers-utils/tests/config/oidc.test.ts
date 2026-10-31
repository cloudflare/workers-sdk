import { it } from "vitest";
import { isIdentityBinding, validOidcAudience } from "../../src/config/oidc";

// The same cases exercise the Go compiler and private signer grammar.
const accepted = [
	"recipient",
	"two words",
	" \u96ea \ud83d\udd10 ",
	"a\nb",
	"urn:example:recipient",
	"mailto:User@Example.COM",
	"custom:",
	"custom:/path",
	"https://EXAMPLE.com:443/a/../b?x=%2f#part",
	"file:///tmp/key",
	"custom://user:password@host:123/path",
	"custom://host:",
	"custom://reg!$&'()*+,;=name/",
	"https://[::1]/",
	"https://[2001:db8::1]:443/",
	"custom://[1:2:3:4:5:6:7:8]/",
	"custom://[::]/",
	"custom://[::ffff:192.0.2.1]/",
	"custom://[1:2:3:4:5:6:192.0.2.1]/",
	"custom://[v1.future:address]/",
	"urn:example:%E9%9B%AA",
];
const rejected = [
	"",
	" \t\r\n",
	":missing-scheme",
	"1scheme:recipient",
	"bad scheme:recipient",
	"https://host/a b",
	'https://host/"quote',
	"urn:example:\u96ea",
	"urn:example:%",
	"urn:example:%0",
	"urn:example:%zz",
	"https://host/?a=%0g",
	"https://host/#a#b",
	"https://host/[]",
	"https://user@@host/",
	"https://host:abc/",
	"https://host:80:90/",
	"https://[::1",
	"https://[garbage]/",
	"https://[1:2:3]/",
	"https://[1:2:3:4:5:6:7:8:9]/",
	"https://[1:2:3:4:5:6:7:8::]/",
	"https://[1::2::3]/",
	"https://[1:2:3:4:5:6:7:]/",
	"https://[::ffff:256.0.0.1]/",
	"https://[::ffff:192.00.2.1]/",
	"https://[::ffff:192.0.2]/",
	"https://[v1.]/",
	"https://[vg.host]/",
	"https://[::1]suffix/",
	"https://host/\\path",
	"\u0085",
	"\ud800",
	"https://host/\\path",
	"recipient:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
];
it.for(accepted)("preserves valid StringOrURI %j", (audience, { expect }) => {
	expect(validOidcAudience(audience)).toBe(true);
});
it.for(rejected)("rejects malformed StringOrURI %j", (audience, { expect }) => {
	expect(validOidcAudience(audience)).toBe(false);
});
it("bounds UTF-8 and rejects ambiguous binding fields", ({ expect }) => {
	expect(validOidcAudience("a".repeat(2048))).toBe(true);
	expect(validOidcAudience("a".repeat(2049))).toBe(false);
	expect(validOidcAudience("雪".repeat(683))).toBe(false);
	const binding = {
		binding: "IDENTITY",
		audience: "recipient",
	};
	expect(isIdentityBinding(binding)).toBe(true);
	expect(isIdentityBinding({ ...binding, binding: "ORDERS\n" })).toBe(false);
	expect(isIdentityBinding({ ...binding, [Symbol("claims")]: {} })).toBe(false);
	expect(
		isIdentityBinding(
			Object.defineProperty({ ...binding }, "claims", { value: {} })
		)
	).toBe(false);
});
