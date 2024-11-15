/// <reference path="middleware-mixed-mode.d.ts"/>

import { getEnv } from "@cloudflare/mixed-mode/lib/get-env";
import { remoteBindings } from "config:middleware/mixed-mode";
import { Middleware } from "./common";

// A middleware has to be a function of type Middleware
const mixedMode: Middleware = async (request, env, _ctx, middlewareCtx) => {
	return middlewareCtx.next(request, getEnv(env, remoteBindings));
};

export default mixedMode;
