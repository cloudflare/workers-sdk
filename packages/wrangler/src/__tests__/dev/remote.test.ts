import { describe, it, vi } from "vitest";
import { RemoteSessionAuthenticationError } from "../../dev/remote";

describe("RemoteSessionAuthenticationError", () => {
	it("preserves the original error as its cause", ({ expect }) => {
		const cause = new Error("original API error");
		const error = new RemoteSessionAuthenticationError(cause);
		expect(error.cause).toBe(cause);
	});

	it("sets a static telemetryMessage", ({ expect }) => {
		const error = new RemoteSessionAuthenticationError(new Error("api error"));
		expect(error.telemetryMessage).toBe("remote dev authentication error");
	});

	describe("when authenticating via CLOUDFLARE_API_TOKEN", () => {
		it("mentions the API token environment variable in the message", ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-token");

			const error = new RemoteSessionAuthenticationError(
				new Error("api error")
			);

			expect(error.message).toMatchInlineSnapshot(`
				"Failed to establish remote session due to an authentication issue.
				It looks like you are authenticating via a custom API token (\`CLOUDFLARE_API_TOKEN\`) set in an environment variable.
				The token may be invalid or lack the required permissions for this operation.

				To fix this, verify that your token is valid and has the correct permissions.
				You can also run \`wrangler whoami\` to check your current authentication status."
			`);
		});
	});

	describe("when authenticating via CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL", () => {
		it("mentions the Global API Key environment variable in the message", ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_API_KEY", "test-key");
			vi.stubEnv("CLOUDFLARE_EMAIL", "test@example.com");

			const error = new RemoteSessionAuthenticationError(
				new Error("api error")
			);

			expect(error.message).toMatchInlineSnapshot(`
				"Failed to establish remote session due to an authentication issue.
				It looks like you are authenticating via a Global API Key (\`CLOUDFLARE_API_KEY\`) set in an environment variable.
				The token may be invalid or lack the required permissions for this operation.

				To fix this, verify that your token is valid and has the correct permissions.
				You can also run \`wrangler whoami\` to check your current authentication status."
			`);
		});
	});

	describe("when authenticating via OAuth (no env credentials)", () => {
		it("suggests re-authenticating with wrangler login", ({ expect }) => {
			// Stub all auth env vars to empty strings so getAuthFromEnv()
			// returns undefined (empty strings are falsy).
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
			vi.stubEnv("CLOUDFLARE_API_KEY", "");
			vi.stubEnv("CLOUDFLARE_EMAIL", "");

			const error = new RemoteSessionAuthenticationError(
				new Error("api error")
			);

			expect(error.message).toMatchInlineSnapshot(`
				"Failed to establish remote session due to an authentication issue.
				Your credentials may have expired or been revoked.

				To fix this, try to:
				  - Run \`wrangler whoami\` to check your current authentication status.
				  - Run \`wrangler logout\` and then \`wrangler login\` to re-authenticate."
			`);
		});
	});
});
