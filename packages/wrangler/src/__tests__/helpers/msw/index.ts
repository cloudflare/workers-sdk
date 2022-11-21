import { matchRequestUrl } from "msw";
import { setupServer } from "msw/node";
import { default as mswAccessHandlers } from "./handlers/access";
import { mswSuccessDeployments } from "./handlers/deployments";
import { mswSuccessNamespacesHandlers } from "./handlers/namespaces";
import { mswSuccessOauthHandlers } from "./handlers/oauth";
import { mswSuccessR2handlers } from "./handlers/r2";
import { default as mswSucessScriptHandlers } from "./handlers/script";
import { mswSuccessUserHandlers } from "./handlers/user";
import { default as mswZoneHandlers } from "./handlers/zones";
import type { MockedRequest } from "msw";
export const msw = setupServer();

function waitForRequest(method: string, url: string) {
	let requestId = "";
	return new Promise<MockedRequest>((resolve, reject) => {
		msw.events.on("request:start", (req) => {
			const matchesMethod = req.method.toLowerCase() === method.toLowerCase();
			const matchesUrl = matchRequestUrl(req.url, url).matches;
			if (matchesMethod && matchesUrl) {
				requestId = req.id;
			}
		});
		msw.events.on("request:match", (req) => {
			if (req.id === requestId) {
				resolve(req);
			}
		});
		msw.events.on("request:unhandled", (req) => {
			if (req.id === requestId) {
				reject(
					new Error(`The ${req.method} ${req.url.href} request was unhandled.`)
				);
			}
		});
	});
}

export {
	mswSuccessUserHandlers,
	mswSuccessR2handlers,
	mswSuccessOauthHandlers,
	mswSuccessNamespacesHandlers,
	mswSucessScriptHandlers,
	mswZoneHandlers,
	mswSuccessDeployments,
	mswAccessHandlers,
	waitForRequest,
};
