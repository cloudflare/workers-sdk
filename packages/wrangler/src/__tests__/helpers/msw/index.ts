import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { default as mswAccessHandlers } from "./handlers/access";
import {
	mswSuccessDeploymentDetails,
	mswSuccessDeployments,
	mswSuccessDeploymentScriptAPI,
	mswSuccessDeploymentScriptMetadata,
} from "./handlers/deployments";
import { mswSuccessNamespacesHandlers } from "./handlers/namespaces";
import { mswSuccessOauthHandlers } from "./handlers/oauth";
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

// Default handler for the queue consumers sync endpoint. Wrangler calls this
// on every deploy (even for workers that don't use queues) so stale consumer
// registrations from previous deploys get cleaned up. Default handlers passed
// to `setupServer` survive `resetHandlers()` between tests, so individual
// tests don't need to mock this unless they want to assert specific behavior.
const mswDefaultSetScriptConsumers = http.put(
	"*/accounts/:accountId/workers/scripts/:scriptName/queue-consumers",
	() => {
		return HttpResponse.json({
			success: true,
			errors: [],
			messages: [],
			result: {
				created: [],
				updated: [],
				deleted: [],
				failed: [],
			},
		});
	}
);

export const msw = setupServer(mswDefaultSetScriptConsumers);

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
