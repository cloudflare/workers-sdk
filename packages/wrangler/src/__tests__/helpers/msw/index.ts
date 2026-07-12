import {
	mswAccessHandlers,
	mswSuccessOauthHandlers,
} from "@cloudflare/workers-auth/test-helpers";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
	mswSuccessDeploymentDetails,
	mswSuccessDeployments,
	mswSuccessDeploymentScriptAPI,
	mswSuccessDeploymentScriptMetadata,
} from "./handlers/deployments";
import { mswSuccessNamespacesHandlers } from "./handlers/namespaces";
import { mswR2handlers } from "./handlers/r2";
import { default as mswSucessScriptHandlers } from "./handlers/script";
import {
	mswSuccessUserHandlers,
	mswFailAccountsHandler,
	mswFailMembershipHandler,
	getMswSuccessMembershipHandlers,
} from "./handlers/user";
import {
	mswGetVersion,
	mswListNewDeployments,
	mswListVersions,
	mswPatchNonVersionedScriptSettings,
	mswPostNewDeployment,
} from "./handlers/versions";
import { default as mswZoneHandlers } from "./handlers/zones";

// A permissive default for the single-account lookup (`GET /accounts/:id`)
// that `getOrSelectAccountId` uses to check the configured/env/cache account
// is reachable by the current login. Returning the requested account keeps the
// happy-path account-reachability check green for every command test without
// each one having to register its own handler. Tests that exercise the
// "account not accessible" path register a `.use()` override that fails this
// request. This exact path has no other handlers (sub-paths like
// `*/accounts/:accountId/workers/...` are matched by their own handlers).
const mswDefaultSingleAccountHandler = http.get(
	"*/accounts/:accountId",
	({ params }) => {
		const accountId = String(params.accountId);
		return HttpResponse.json(
			createFetchResult({ id: accountId, name: "Mock Account" })
		);
	}
);

export const msw = setupServer(mswDefaultSingleAccountHandler);

function createFetchResult(
	result: unknown,
	success = true,
	errors: unknown[] = [],
	messages: unknown[] = [],
	result_info?: Record<string, unknown>
) {
	return result_info
		? {
				result,
				success,
				errors,
				messages,
				result_info,
			}
		: {
				result,
				success,
				errors,
				messages,
			};
}

export {
	createFetchResult,
	getMswSuccessMembershipHandlers,
	mswFailMembershipHandler,
	mswFailAccountsHandler,
	mswSuccessUserHandlers,
	mswR2handlers,
	mswSuccessOauthHandlers,
	mswSuccessNamespacesHandlers,
	mswSucessScriptHandlers,
	mswZoneHandlers,
	mswSuccessDeployments,
	mswSuccessDeploymentDetails,
	mswAccessHandlers,
	mswSuccessDeploymentScriptMetadata,
	mswSuccessDeploymentScriptAPI,
	mswPostNewDeployment,
	mswGetVersion,
	mswListNewDeployments,
	mswListVersions,
	mswPatchNonVersionedScriptSettings,
};
