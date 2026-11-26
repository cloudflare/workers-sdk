import { Headers } from "undici";
import { beforeEach, describe, it, vi } from "vitest";
import {
	addCustomApiHeaders,
	getCustomApiHeaders,
} from "../src/custom-api-headers";

beforeEach(() => {
	vi.stubEnv("CLOUDFLARE_API_HEADERS", undefined);
	vi.stubEnv("WRANGLER_LOG_SANITIZE", undefined);
});

describe("custom API header configuration", () => {
	it.for([undefined, "", "{}"])(
		"accepts empty configuration %s",
		(raw, { expect }) => {
			vi.stubEnv("CLOUDFLARE_API_HEADERS", raw);
			expect(getCustomApiHeaders()).toEqual({});
		}
	);

	it("reads string values and changes in the environment", ({ expect }) => {
		vi.stubEnv(
			"CLOUDFLARE_API_HEADERS",
			'{"X-Custom-Header":"value: one,two", "X-Empty":"", "__proto__":"safe"}'
		);
		expect(getCustomApiHeaders()).toEqual(
			JSON.parse(
				'{"x-custom-header":"value: one,two","x-empty":"","__proto__":"safe"}'
			)
		);
		vi.stubEnv("CLOUDFLARE_API_HEADERS", '{"X-Custom-Header":"changed"}');
		expect(getCustomApiHeaders()).toEqual({ "x-custom-header": "changed" });
	});

	it.for([
		"secret-invalid-json",
		"null",
		"[]",
		'"secret"',
		'{"X-Test":1}',
		'{"X-Test":null}',
		'{"X-Test":["secret"]}',
		'{"Invalid Name":"secret"}',
		'{"X-Test":"secret\\r\\ninjected"}',
		'{"X-Test":"secret…"}',
		'{"X-Test":"secret","x-test":"another"}',
	])(
		"rejects invalid configuration without echoing values: %s",
		(raw, { expect }) => {
			vi.stubEnv("CLOUDFLARE_API_HEADERS", raw);
			expect(getCustomApiHeaders).toThrow("CLOUDFLARE_API_HEADERS");
			try {
				getCustomApiHeaders();
			} catch (error) {
				expect(String(error)).not.toContain("secret");
				expect(error).toMatchObject({
					telemetryMessage: "cfetch custom api headers invalid configuration",
				});
			}
		}
	);

	it.for([
		"Host",
		"Content-Type",
		"Content-Encoding",
		"Content-Length",
		"Connection",
		"Transfer-Encoding",
		"Upgrade",
		"TE",
		"Trailer",
	])("protects %s case insensitively", (name, { expect }) => {
		vi.stubEnv(
			"CLOUDFLARE_API_HEADERS",
			JSON.stringify({ [name.toUpperCase()]: "secret" })
		);
		expect(getCustomApiHeaders).toThrow("protected header");
	});

	it.for([
		"Authorization",
		"X-Auth-Key",
		"X-Auth-Email",
		"Proxy-Authorization",
	])("allows and overrides %s case insensitively", (name, { expect }) => {
		vi.stubEnv(
			"CLOUDFLARE_API_HEADERS",
			JSON.stringify({ [name.toUpperCase()]: "configured-secret" })
		);
		const headers = new Headers({ [name]: "request-secret" });
		addCustomApiHeaders(headers);
		expect(headers.get(name)).toBe("configured-secret");
	});
});

describe("custom API header overrides", () => {
	it("overrides unprotected request headers case insensitively", ({
		expect,
	}) => {
		vi.stubEnv(
			"CLOUDFLARE_API_HEADERS",
			'{"X-Custom-Header":"value","X-Other":"other"}'
		);
		const headers = new Headers({
			"X-CUSTOM-HEADER": "override",
			Authorization: "Bearer token",
		});
		addCustomApiHeaders(headers);
		expect(Object.fromEntries(headers)).toEqual({
			"x-custom-header": "value",
			"x-other": "other",
			authorization: "Bearer token",
		});
	});
});
