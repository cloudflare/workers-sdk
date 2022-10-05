import { setupServer } from "msw/node";
import { mswSucessNamespacesHandlers } from "./handlers/namespaces";
import { mswSucessOauthHandlers } from "./handlers/oauth";
import { mswSucessR2handlers } from "./handlers/r2";
import { mswSucessUserHandlers } from "./handlers/user";

export const msw = setupServer();

export {
	mswSucessUserHandlers,
	mswSucessR2handlers,
	mswSucessOauthHandlers,
	mswSucessNamespacesHandlers,
};
