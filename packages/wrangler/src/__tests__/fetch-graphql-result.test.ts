import { rest } from "msw";
import { fetchGraphqlResult } from "../cfetch";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockOAuthFlow } from "./helpers/mock-oauth-flow";
import { msw } from "./helpers/msw";

describe("fetchGraphqlResult", () => {
	mockAccountId({ accountId: null });
	mockApiToken();
	const { mockOAuthServerCallback } = mockOAuthFlow();

	it("should make a request against the graphql endpoint by default", async () => {
		mockOAuthServerCallback();
		msw.use(
			rest.post("*/graphql", async (req, res, ctx) => {
				return res(
					ctx.status(200),
					ctx.json({
						data: {
							viewer: {
								__typename: "viewer",
							},
						},
						errors: null,
					})
				);
			})
		);
		expect(
			await fetchGraphqlResult({
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
		mockOAuthServerCallback();
		const now = new Date().toISOString();
		msw.use(
			rest.post("*/graphql", async (req, res, ctx) => {
				return res(
					ctx.status(200),
					ctx.json({
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
					})
				);
			})
		);
		expect(await fetchGraphqlResult()).toEqual({
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
