import { setupServer } from "msw/node";
import { default as mswAccessHandlers } from "./handlers/access";
import { mswSuccessDeployments } from "./handlers/deployments";
import { mswSuccessNamespacesHandlers } from "./handlers/namespaces";
import { mswSuccessOauthHandlers } from "./handlers/oauth";
import { mswSuccessR2handlers } from "./handlers/r2";
import { default as mswSucessScriptHandlers } from "./handlers/script";
import { mswSuccessUserHandlers } from "./handlers/user";
export const msw = setupServer();

export {
	mswSuccessUserHandlers,
	mswSuccessR2handlers,
	mswSuccessOauthHandlers,
	mswSuccessNamespacesHandlers,
	mswSucessScriptHandlers,
	mswSuccessDeployments,
	mswAccessHandlers,
};
