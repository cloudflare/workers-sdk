import { http, HttpResponse } from "msw";
import { createFetchResult } from "../index";

// Keep `/accounts` and `/memberships` aligned by default. Wrangler now
// intersects these two endpoints to determine which accounts the current
// login auth can use, so the default fixtures must agree on the same set
// of accounts.
//
// The `/accounts` and `/memberships` handlers are registered without
// `{ once: true }` so a single test that triggers multiple requests to
// either endpoint (e.g. `wrangler whoami --account ...` which calls
// `/memberships` from both `fetchAllAccounts` and `fetchMembershipRoles`)
// resolves consistently. Tests that need a different response can still
// register a `once: true` override on top.
const DEFAULT_ACCOUNTS = [
	{ name: "Account One", id: "account-1" },
	{ name: "Account Two", id: "account-2" },
	{ name: "Account Three", id: "account-3" },
];

export function getMswSuccessMembershipHandlers(
	accounts: typeof DEFAULT_ACCOUNTS = DEFAULT_ACCOUNTS
) {
	return [
		http.get("*/accounts", () => {
			return HttpResponse.json(createFetchResult(accounts));
		}),
		http.get("*/memberships", () => {
			return HttpResponse.json(
				createFetchResult(
					accounts.map((account, index) => ({
						id: `membership-id-${index + 1}`,
						account,
					}))
				)
			);
		}),
	];
}

export const mswFailMembershipHandler = http.get(
	"*/memberships",
	() => {
		return HttpResponse.json(createFetchResult([], false));
	},
	{ once: true }
);

export const mswFailAccountsHandler = http.get(
	"*/accounts",
	() => {
		return HttpResponse.json(createFetchResult([], false));
	},
	{ once: true }
);

export const mswSuccessUserHandlers = [
	http.get(
		"*/user",
		() => {
			return HttpResponse.json(
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
			);
		},
		{ once: true }
	),
	...getMswSuccessMembershipHandlers(),
];
