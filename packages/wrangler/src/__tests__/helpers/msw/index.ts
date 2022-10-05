import { setupServer } from "msw/node";
import { mswSuccessNamespacesHandlers } from "./handlers/namespaces";
import { mswSuccessOauthHandlers } from "./handlers/oauth";
import { mswSuccessR2handlers } from "./handlers/r2";
import { mswSuccessUserHandlers } from "./handlers/user";

export const msw = setupServer();

export {
	mswSuccessUserHandlers,
	mswSuccessR2handlers,
	mswSuccessOauthHandlers,
	mswSuccessNamespacesHandlers,
};
