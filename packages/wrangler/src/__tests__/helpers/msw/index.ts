import { setupServer } from "msw/node";

// TODO: Decide to move to Jest setup or leave in this helper file - JACOB
export const msw = setupServer();
