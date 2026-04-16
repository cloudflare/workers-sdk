import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import { describe, it } from "vitest";
import { fetchGraphqlResult } from "../cfetch";
import { extractWAFBlockRayId, isWAFBlockResponse } from "../cfetch/internal";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { msw } from "./helpers/msw";

const WAF_BLOCK_HTML = `<!DOCTYPE html>
<html>
<head><title>Attention Required! | Cloudflare</title></head>
<body>
  <h1 data-translate="block_headline">Sorry, you have been blocked</h1>
  <h2 class="cf-subheadline"><span data-translate="unable_to_access">You are unable to access</span> api.cloudflare.com</h2>
  <p>Cloudflare Ray ID: 9e8116df4823e2c5</p>
</body>
</html>`;

const WAF_BLOCK_HTML_NO_RAY_ID = `<!DOCTYPE html>
<html>
<head><title>Attention Required! | Cloudflare</title></head>
<body>
  <h1 data-translate="block_headline">Sorry, you have been blocked</h1>
  <h2 class="cf-subheadline"><span data-translate="unable_to_access">You are unable to access</span> api.cloudflare.com</h2>
</body>
</html>`;

describe("isWAFBlockResponse", () => {
	it("should detect a WAF block page", ({ expect }) => {
		expect(isWAFBlockResponse(WAF_BLOCK_HTML)).toBe(true);
	});

	it("should detect a WAF block page without a Ray ID", ({ expect }) => {
		expect(isWAFBlockResponse(WAF_BLOCK_HTML_NO_RAY_ID)).toBe(true);
	});

	it("should return false for valid JSON", ({ expect }) => {
		expect(
			isWAFBlockResponse(
				JSON.stringify({ success: true, result: {}, errors: [], messages: [] })
			)
		).toBe(false);
	});

	it("should return false for other HTML error pages", ({ expect }) => {
		expect(
			isWAFBlockResponse("<html><body>Internal Server Error</body></html>")
		).toBe(false);
	});
});

describe("extractWAFBlockRayId", () => {
	it("should extract the Ray ID from a WAF block page", ({ expect }) => {
		expect(extractWAFBlockRayId(WAF_BLOCK_HTML)).toBe("9e8116df4823e2c5");
	});

	it("should return undefined when no Ray ID is present", ({ expect }) => {
		expect(extractWAFBlockRayId(WAF_BLOCK_HTML_NO_RAY_ID)).toBeUndefined();
	});

	it("should return undefined for non-HTML content", ({ expect }) => {
		expect(extractWAFBlockRayId("some random text")).toBeUndefined();
	});
});

describe("fetchInternal WAF block detection", () => {
	mockAccountId({ accountId: null });
	mockApiToken();

	it("should throw a helpful error when the API returns a WAF block page", async ({
		expect,
	}) => {
		msw.use(
			http.post("*/graphql", async () => {
				return new HttpResponse(WAF_BLOCK_HTML, {
					status: 403,
					statusText: "Forbidden",
					headers: { "Content-Type": "text/html" },
				});
			})
		);
		await expect(
			fetchGraphqlResult(COMPLIANCE_REGION_CONFIG_UNKNOWN, {
				body: JSON.stringify({ query: "{ viewer { __typename } }" }),
			})
		).rejects.toThrow(
			"The Cloudflare API responded with a WAF block page instead of the expected JSON response"
		);
	});

	it("should include the Ray ID in the error when present", async ({
		expect,
	}) => {
		msw.use(
			http.post("*/graphql", async () => {
				return new HttpResponse(WAF_BLOCK_HTML, {
					status: 403,
					statusText: "Forbidden",
					headers: { "Content-Type": "text/html" },
				});
			})
		);
		try {
			await fetchGraphqlResult(COMPLIANCE_REGION_CONFIG_UNKNOWN, {
				body: JSON.stringify({ query: "{ viewer { __typename } }" }),
			});
			expect.unreachable("should have thrown");
		} catch (e) {
			const error = e as { notes: { text: string }[] };
			const rayIdNote = error.notes.find((n: { text: string }) =>
				n.text.includes("Cloudflare Ray ID:")
			);
			expect(rayIdNote).toBeDefined();
			expect(rayIdNote?.text).toBe("Cloudflare Ray ID: 9e8116df4823e2c5");
			const supportNote = error.notes.find((n: { text: string }) =>
				n.text.includes("open a Cloudflare Support ticket")
			);
			expect(supportNote?.text).toBe(
				"If the issue persists, please open a Cloudflare Support ticket and include the Ray ID above."
			);
		}
	});

	it("should still throw a WAF error without the Ray ID note when Ray ID is absent", async ({
		expect,
	}) => {
		msw.use(
			http.post("*/graphql", async () => {
				return new HttpResponse(WAF_BLOCK_HTML_NO_RAY_ID, {
					status: 403,
					statusText: "Forbidden",
					headers: { "Content-Type": "text/html" },
				});
			})
		);
		try {
			await fetchGraphqlResult(COMPLIANCE_REGION_CONFIG_UNKNOWN, {
				body: JSON.stringify({ query: "{ viewer { __typename } }" }),
			});
			expect.unreachable("should have thrown");
		} catch (e) {
			const error = e as { text: string; notes: { text: string }[] };
			expect(error.text).toBe(
				"The Cloudflare API responded with a WAF block page instead of the expected JSON response"
			);
			const rayIdNote = error.notes.find((n: { text: string }) =>
				n.text.includes("Cloudflare Ray ID:")
			);
			expect(rayIdNote).toBeUndefined();
			const supportNote = error.notes.find((n: { text: string }) =>
				n.text.includes("open a Cloudflare Support ticket")
			);
			expect(supportNote?.text).toBe(
				"If the issue persists, please open a Cloudflare Support ticket. You can find the Cloudflare Ray ID on the block page in your browser."
			);
		}
	});

	it("should still throw 'malformed response' for non-WAF HTML responses", async ({
		expect,
	}) => {
		msw.use(
			http.post("*/graphql", async () => {
				return new HttpResponse(
					"<html><body>Internal Server Error</body></html>",
					{
						status: 500,
						statusText: "Internal Server Error",
						headers: { "Content-Type": "text/html" },
					}
				);
			})
		);
		await expect(
			fetchGraphqlResult(COMPLIANCE_REGION_CONFIG_UNKNOWN, {
				body: JSON.stringify({ query: "{ viewer { __typename } }" }),
			})
		).rejects.toThrow("Received a malformed response from the API");
	});
});
