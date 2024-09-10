/// <reference path="middleware-mock-analytics-engine.d.ts"/>

import { bindings } from "config:middleware/mock-analytics-engine";
import type { Middleware } from "./common";

const bindingsEnv = Object.fromEntries(
	bindings.map((binding) => [
		binding,
		{
			writeDataPoint() {
				// no op in dev
			},
		},
	])
) satisfies Record<string, AnalyticsEngineDataset>;

const analyticsEngine: Middleware = async (
	request,
	env,
	_ctx,
	middlewareCtx
) => {
	// we're going to directly modify env so it maintains referential equality
	for (const binding of bindings) {
		env[binding] ??= bindingsEnv[binding];
	}
	return await middlewareCtx.next(request, env);
};

export default analyticsEngine;
