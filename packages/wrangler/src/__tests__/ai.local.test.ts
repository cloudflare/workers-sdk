import { Request } from "miniflare";
import { http, HttpResponse } from "msw";
import { AIFetcher } from "../ai/fetcher";
import { msw } from "./helpers/msw";

describe("ai", () => {
	describe("fetcher", () => {
		describe("local", () => {
			it("should send x-forwarded-host header", async () => {
				mockAIProxyRequest();

				const url = "http://internal.ai/ai/test/path?version=123";
				const resp = await AIFetcher(
					new Request(url, {
						method: 'PATCH',
						headers: {
							"x-example": "test",
						},
					})
				);

				expect(await resp.json()).toEqual({ xForwardedFor: url, method: 'PATCH' });
			});
		});
	});
});

function mockAIProxyRequest() {
	msw.use(
		http.get(
			"*/accounts/:accountId/ai/run/proxy",
			(c) => {
				return HttpResponse.json({
					xForwardedFor: c.request.headers.get("X-Forwarded-Host"),
					method: c.request.method
				});
			},
			{ once: true }
		)
	);
}
