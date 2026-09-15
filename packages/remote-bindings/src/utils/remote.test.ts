import { APIError } from "@cloudflare/workers-utils";
import { afterEach, describe, it, vi } from "vitest";
import {
	handlePreviewSessionCreationError,
	RemoteSessionAuthenticationError,
} from "./remote";

afterEach(() => {
	vi.unstubAllEnvs();
});

function makeAuthError(code: number, status = 400): APIError {
	const error = new APIError({
		text: "A request to the Cloudflare API failed.",
		status,
		telemetryMessage: false,
	});
	error.code = code;
	return error;
}

describe("RemoteSessionAuthenticationError", () => {
	it("preserves the cause and telemetry message", ({ expect }) => {
		const cause = new Error("original API error");
		const error = new RemoteSessionAuthenticationError(cause);

		expect(error.cause).toBe(cause);
		expect(error.telemetryMessage).toBe("remote dev authentication error");
	});

	it("explains remote bindings when authenticating with an API token", ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-token");

		const error = new RemoteSessionAuthenticationError(new Error("api error"));

		expect(error.message).toMatchInlineSnapshot(`
			"This Worker uses bindings that need to run remotely, even when developing locally, but the remote session could not be authenticated.
			It looks like you are authenticating via a custom API token (\`CLOUDFLARE_API_TOKEN\`) set in an environment variable.
			The token may be invalid or lack the required permissions for this operation.

			To fix this, verify that your token is valid and has the correct permissions.
			You can also run \`wrangler whoami\` to check your current authentication status."
		`);
	});

	it("explains remote bindings when authenticating with OAuth", ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
		vi.stubEnv("CLOUDFLARE_API_KEY", "");
		vi.stubEnv("CLOUDFLARE_EMAIL", "");

		const error = new RemoteSessionAuthenticationError(new Error("api error"));

		expect(error.message).toMatchInlineSnapshot(`
			"This Worker uses bindings that need to run remotely, even when developing locally, but the remote session could not be authenticated.
			Your credentials may have expired or been revoked.

			To fix this, try to:
			  - Run \`wrangler whoami\` to check your current authentication status.
			  - Run \`wrangler logout\` and then \`wrangler login\` to re-authenticate."
		`);
	});
});

describe("handlePreviewSessionCreationError", () => {
	for (const { code, status } of [
		{ code: 9106, status: 400 },
		{ code: 10000, status: 400 },
		{ code: 10405, status: 405 },
	]) {
		it(`wraps API authentication error ${code}`, ({ expect }) => {
			const cause = makeAuthError(code, status);
			let thrown: unknown;

			try {
				handlePreviewSessionCreationError(cause, "test-account-id");
			} catch (error) {
				thrown = error;
			}

			expect(thrown).toBeInstanceOf(RemoteSessionAuthenticationError);
			expect((thrown as RemoteSessionAuthenticationError).cause).toBe(cause);
			expect((thrown as RemoteSessionAuthenticationError).message).toContain(
				"bindings that need to run remotely, even when developing locally"
			);
		});
	}
});
