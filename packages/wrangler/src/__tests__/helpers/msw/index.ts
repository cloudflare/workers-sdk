import { setupServer } from "msw/node";
import { mswDefaultHandlers } from "./handlers";
import { handlers as oauthHandlers } from "./oauth";

export const msw = setupServer(...mswDefaultHandlers, ...oauthHandlers);
