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

it("accepts managed signing without a token audience and rejects protocol options", ({
	expect,
}) => {
	const config = {
		binding: "IDENTITY",
		request_signing: {
			allowed_origins: ["https://api.example"],
			allowed_methods: ["GET"],
		},
	};
	expect(isIdentityBinding(config)).toBe(true);
	expect(
		isIdentityBinding({
			...config,
			request_signing: { ...config.request_signing, profile: "web-bot-auth" },
		})
	).toBe(false);
	expect(isIdentityBinding({ ...config, audience: "" })).toBe(false);
	expect(
		isIdentityBinding({
			...config,
			request_signing: { ...config.request_signing, customer_id: "forged" },
		})
	).toBe(false);
});

// Configuration consumers delegate these rules to the shared validator.
it.for([
	{ audience: " " },
	{ identity_id: "orders" },
	{ allowed_audiences: ["urn:orders"] },
	{ subject: "durable-object-namespace" },
	{ namespace_id: "namespace" },
	{
		request_signing: {
			profile: "other",
			allowed_origins: ["https://api.example"],
			allowed_methods: ["GET"],
		},
	},
	{
		authorization_grants: {
			allowed_authorization_servers: ["https://auth.example?query"],
			allowed_scopes: [],
		},
	},
])("rejects invalid identity configuration %j", (limits, { expect }) => {
	expect(
		isIdentityBinding({
			binding: "IDENTITY",
			audience: "urn:orders",
			...limits,
		})
	).toBe(false);
});

it("validates both managed OAuth profiles and independent public assertion authority", ({
	expect,
}) => {
	const oauth = {
		exchange: "client_credentials",
		client_id: "provider-id",
		authorization_server: "https://auth.example",
		token_endpoint: "https://auth.example/token",
		resource: "https://api.example",
		scope: ["read"],
		allowed_origins: ["https://api.example"],
		allowed_methods: ["GET"],
		require_sender_constraint: true,
	};
	const config = { binding: "API", oauth, client_authentication: true };
	for (const exchange of ["client_credentials", "workload_authorization"]) {
		const policy = {
			...oauth,
			exchange,
			client_id: exchange === "client_credentials" ? "provider-id" : undefined,
		};
		expect(isIdentityBinding({ binding: "API", oauth: policy })).toBe(true);
		expect(
			isIdentityBinding({
				binding: "API",
				oauth: { ...policy, http_message_signatures: "web_bot_auth" },
			})
		).toBe(true);
		for (const value of [null, "", "other", true, {}, []]) {
			expect(
				isIdentityBinding({
					binding: "API",
					oauth: { ...policy, http_message_signatures: value },
				})
			).toBe(false);
		}
	}

	expect(isIdentityBinding(config)).toBe(true);
	expect(
		isIdentityBinding({
			...config,
			oauth: {
				...oauth,
				exchange: "workload_authorization",
				client_id: undefined,
			},
		})
	).toBe(true);
	for (const patch of [
		{ exchange: "workload_authorization" },
		{ client_id: undefined },
		{ require_sender_constraint: false },
		{ scope: [] },
		{ scope: ["read", "read"] },
		{ allowed_methods: ["TRACE"] },
		{ token_endpoint: "http://auth.example/token" },
		{ extra: true },
	]) {
		expect(
			isIdentityBinding({ ...config, oauth: { ...oauth, ...patch } })
		).toBe(false);
	}
	expect(
		isIdentityBinding({
			...config,
			request_signing: {
				allowed_origins: oauth.allowed_origins,
				allowed_methods: ["GET"],
			},
		})
	).toBe(false);
	expect(isIdentityBinding({ ...config, client_authentication: "true" })).toBe(
		false
	);
});
