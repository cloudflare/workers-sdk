import { setupServer } from "msw/node";
import { mswDefaultHandlers } from "./handlers";

export const msw = setupServer(...mswDefaultHandlers);
