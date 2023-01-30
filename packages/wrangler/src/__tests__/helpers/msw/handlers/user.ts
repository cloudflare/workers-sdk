import { rest } from "msw";
import { createFetchResult } from "../index";

export const mswSuccessUserHandlers = [
	rest.get("*/user", (_, response, cxt) => {
		return response.once(
			cxt.json(
				createFetchResult({
					id: "7c5dae5552338874e5053f2534d2767a",
					email: "user@example.com",
					first_name: "John",
					last_name: "Appleseed",
					username: "cfuser12345",
					telephone: "+1 123-123-1234",
					country: "US",
					zipcode: "12345",
					created_on: "2014-01-01T05:20:00Z",
					modified_on: "2014-01-01T05:20:00Z",
					two_factor_authentication_enabled: false,
					suspended: false,
				})
			)
		);
	}),
	rest.get("*/accounts", (_, response, cxt) => {
		return response.once(
			cxt.json(
				createFetchResult([
					{ name: "Account One", id: "account-1" },
					{ name: "Account Two", id: "account-2" },
					{ name: "Account Three", id: "account-3" },
				])
			)
		);
	}),
	rest.get("*/memberships", (_, response, context) => {
		return response.once(
			context.json(
				createFetchResult([
					{
						id: "membership-id-1",
						account: { id: "account-id-1", name: "My Personal Account" },
					},
					{
						id: "membership-id-2",
						account: { id: "account-id-2", name: "Enterprise Account" },
					},
				])
			)
		);
	}),
];
