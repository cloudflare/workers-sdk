// barrel import for msw handlers
import { mswNamespacesHandlers } from "./namespaces";
import { mswOauthHandlers } from "./oauth";
import { mswR2handlers } from "./r2";
import { mswUserHandlers } from "./user";

// All the handlers are used in msw/index for setting up the server
export const mswDefaultHandlers = [
	...mswOauthHandlers,
	...mswR2handlers,
	...mswUserHandlers,
	...mswNamespacesHandlers,
];
