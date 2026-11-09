import { Headers } from "undici";
import { it, vi } from "vitest";
import { sanitizeHeaders } from "../src/sanitize-headers";

it.for([undefined, "true", "false"])(
	"redacts values outside the allowlist with WRANGLER_LOG_SANITIZE=%s",
	(sanitize, { expect }) => {
		vi.stubEnv("WRANGLER_LOG_SANITIZE", sanitize);
		const headers = new Headers({
			Authorization: "Bearer secret",
			"X-Auth-Key": "global-key",
			"X-Auth-Email": "user@example.com",
			"Proxy-Authorization": "Basic proxy-secret",
			Cookie: "session=secret",
			"Set-Cookie": "session=secret",
			"X-Custom-Header": "custom-secret",
			Accept: "application/json",
			"Content-Type": "application/json",
			"CF-Ray": "ray-id",
		});
		expect(sanitizeHeaders(headers)).toEqual({
			authorization: "[REDACTED]",
			"x-auth-key": "[REDACTED]",
			"x-auth-email": "[REDACTED]",
			"proxy-authorization": "[REDACTED]",
			cookie: "[REDACTED]",
			"set-cookie": "[REDACTED]",
			"x-custom-header": "[REDACTED]",
			accept: "application/json",
			"content-type": "application/json",
			"cf-ray": "ray-id",
		});
		expect(headers.get("authorization")).toBe("Bearer secret");
		expect(headers.get("x-custom-header")).toBe("custom-secret");
	}
);

it("matches header names case insensitively", ({ expect }) => {
	expect(
		sanitizeHeaders([
			["Content-TYPE", "text/plain"],
			["X-Secret", "secret"],
		])
	).toEqual({
		"Content-TYPE": "text/plain",
		"X-Secret": "[REDACTED]",
	});
});
