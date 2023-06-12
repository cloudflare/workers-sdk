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
				method: "POST",
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
});
