import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import { describe, it } from "vitest";
import { fetchGraphqlResult } from "../cfetch";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { msw } from "./helpers/msw";

describe("fetchGraphqlResult", () => {
	mockAccountId({ accountId: null });
	mockApiToken();

	it("should make a request against the graphql endpoint by default", async ({
		expect,
	}) => {
		msw.use(
			http.post("*/graphql", async () => {
				return HttpResponse.json(
					{
						data: {
							viewer: {
								__typename: "viewer",
							},
						},
						errors: null,
					},
					{ status: 200 }
				);
			})
		);
		expect(
			await fetchGraphqlResult(COMPLIANCE_REGION_CONFIG_UNKNOWN, {
				body: JSON.stringify({
					query: `{
                    viewer {
                      __typename
                    }
                  }`,
				}),
			})
		).toEqual({ data: { viewer: { __typename: "viewer" } }, errors: null });
	});

	it("should accept a request with no init, but return no data", async () => {
		const now = new Date().toISOString();
		msw.use(
			http.post("*/graphql", async () => {
				return HttpResponse.json(
					{
						data: null,
						errors: [
							{
								message: "failed to recognize JSON request: 'EOF'",
								path: null,
								extensions: {
									timestamp: now,
								},
							},
						],
					},
					{ status: 200 }
				);
			})
		);
		expect(await fetchGraphqlResult(COMPLIANCE_REGION_CONFIG_UNKNOWN)).toEqual({
			data: null,
			errors: [
				{
					message: "failed to recognize JSON request: 'EOF'",
					path: null,
					extensions: {
						timestamp: now,
					},
				},
			],
		});
	});
});
