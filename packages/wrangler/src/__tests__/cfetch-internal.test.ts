import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import { describe, it } from "vitest";
import { fetchGraphqlResult } from "../cfetch";
import { extractWAFBlockRayId, isWAFBlockResponse } from "../cfetch/internal";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { msw } from "./helpers/msw";

describe("isWAFBlockResponse", () => {
	it("should detect a WAF-mitigated response", ({ expect }) => {
		const headers = new Headers({ "cf-mitigated": "challenge" });
		expect(isWAFBlockResponse(headers)).toBe(true);
	});

	it("should return false when cf-mitigated header is absent", ({ expect }) => {
		const headers = new Headers();
		expect(isWAFBlockResponse(headers)).toBe(false);
	});

	it("should return false when cf-mitigated has a different value", ({
		expect,
	}) => {
		const headers = new Headers({ "cf-mitigated": "other" });
		expect(isWAFBlockResponse(headers)).toBe(false);
	});
});

describe("extractWAFBlockRayId", () => {
	it("should extract the Ray ID from the cf-ray header", ({ expect }) => {
		const headers = new Headers({ "cf-ray": "9e8116df4823e2c5" });
		expect(extractWAFBlockRayId(headers)).toBe("9e8116df4823e2c5");
	});

	it("should return undefined when cf-ray header is absent", ({ expect }) => {
		const headers = new Headers();
		expect(extractWAFBlockRayId(headers)).toBeUndefined();
	});
});

describe("fetchInternal WAF block detection", () => {
	mockAccountId({ accountId: null });
	mockApiToken();

	it("should throw a helpful error when the API returns a WAF block response", async ({
		expect,
	}) => {
		msw.use(
			http.post("*/graphql", async () => {
				return new HttpResponse("blocked", {
					status: 403,
					statusText: "Forbidden",
					headers: {
						"Content-Type": "text/html",
						"cf-mitigated": "challenge",
						"cf-ray": "9e8116df4823e2c5",
					},
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

	it("should include the Ray ID in the error when cf-ray header is present", async ({
		expect,
	}) => {
		msw.use(
			http.post("*/graphql", async () => {
				return new HttpResponse("blocked", {
					status: 403,
					statusText: "Forbidden",
					headers: {
						"Content-Type": "text/html",
						"cf-mitigated": "challenge",
						"cf-ray": "9e8116df4823e2c5",
					},
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

	it("should still throw a WAF error without the Ray ID note when cf-ray header is absent", async ({
		expect,
	}) => {
		msw.use(
			http.post("*/graphql", async () => {
				return new HttpResponse("blocked", {
					status: 403,
					statusText: "Forbidden",
					headers: {
						"Content-Type": "text/html",
						"cf-mitigated": "challenge",
					},
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

	it("should include the Ray ID in 'malformed response' error when cf-ray header is present", async ({
		expect,
	}) => {
		msw.use(
			http.post("*/graphql", async () => {
				return new HttpResponse(
					"<html><body>Internal Server Error</body></html>",
					{
						status: 500,
						statusText: "Internal Server Error",
						headers: {
							"Content-Type": "text/html",
							"cf-ray": "abc123def456",
						},
					}
				);
			})
		);
		try {
			await fetchGraphqlResult(COMPLIANCE_REGION_CONFIG_UNKNOWN, {
				body: JSON.stringify({ query: "{ viewer { __typename } }" }),
			});
			expect.unreachable("should have thrown");
		} catch (e) {
			const error = e as { text: string; notes: { text: string }[] };
			expect(error.text).toBe("Received a malformed response from the API");
			const rayIdNote = error.notes.find((n: { text: string }) =>
				n.text.includes("Cloudflare Ray ID:")
			);
			expect(rayIdNote).toBeDefined();
			expect(rayIdNote?.text).toBe("Cloudflare Ray ID: abc123def456");
		}
	});

	it("should omit the Ray ID in 'malformed response' error when cf-ray header is absent", async ({
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
		try {
			await fetchGraphqlResult(COMPLIANCE_REGION_CONFIG_UNKNOWN, {
				body: JSON.stringify({ query: "{ viewer { __typename } }" }),
			});
			expect.unreachable("should have thrown");
		} catch (e) {
			const error = e as { text: string; notes: { text: string }[] };
			expect(error.text).toBe("Received a malformed response from the API");
			const rayIdNote = error.notes.find((n: { text: string }) =>
				n.text.includes("Cloudflare Ray ID:")
			);
			expect(rayIdNote).toBeUndefined();
		}
	});
});
