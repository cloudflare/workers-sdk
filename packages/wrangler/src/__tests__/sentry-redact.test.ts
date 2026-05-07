import { describe, it } from "vitest";
import { redactOAuthSecrets } from "../sentry";

/**
 * Coverage for the OAuth-secret redaction patterns wired into Sentry's
 * `beforeSend` hook. See `sentry/index.ts` and REVIEW-17452 #23 / #12.
 */
describe("redactOAuthSecrets", () => {
	it("redacts code= in a query string", ({ expect }) => {
		expect(
			redactOAuthSecrets(
				"https://example.com/cb?code=abc123&state=xyz&extra=ok"
			)
		).toBe("https://example.com/cb?code=<redacted>&state=<redacted>&extra=ok");
	});

	it("redacts code_verifier= and code_challenge=", ({ expect }) => {
		expect(
			redactOAuthSecrets(
				"params: code_verifier=verysecret&code_challenge=hash123"
			)
		).toBe("params: code_verifier=<redacted>&code_challenge=<redacted>");
	});

	it("redacts wsToken= (Phase 3 secret)", ({ expect }) => {
		expect(redactOAuthSecrets("debug: wsToken=abcdef")).toBe(
			"debug: wsToken=<redacted>"
		);
	});

	it("redacts JWT-shaped tokens", ({ expect }) => {
		expect(
			redactOAuthSecrets(
				"Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signature_part_here"
			)
		).toBe("Bearer <redacted-jwt>");
	});

	it("stops at whitespace so it doesn't eat surrounding text", ({ expect }) => {
		// `code=` appears as a literal here, not a query param. The pattern
		// stops at whitespace so we redact only the bare value and leave
		// the rest of the sentence intact.
		expect(redactOAuthSecrets("Wrote the code=happily yesterday")).toBe(
			"Wrote the code=<redacted> yesterday"
		);
	});

	it("is idempotent (safe to apply twice)", ({ expect }) => {
		const once = redactOAuthSecrets("code=abc&state=xyz");
		expect(redactOAuthSecrets(once)).toBe(once);
	});

	it("returns the input unchanged when no secrets are present", ({
		expect,
	}) => {
		expect(redactOAuthSecrets("nothing to see here")).toBe(
			"nothing to see here"
		);
	});
});
