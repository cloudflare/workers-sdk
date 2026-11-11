import { compareRoutes } from "../index";
import { test } from "vitest";
import type { RouteConfig } from "../index";
import type { UrlPath } from "@cloudflare/workers-utils";

// https://github.com/cloudflare/workers-sdk/issues/1917
function route(routePath: string): RouteConfig {
	return {
		routePath: routePath as UrlPath,
		mountPath: "/" as UrlPath,
		method: "",
		module: ["x.js:onRequest"],
	};
}

test("root index route (/) takes precedence over a root catch-all (/:path*)", ({
	expect,
}) => {
	expect(compareRoutes(route("/"), route("/:path*"))).toBeLessThan(0);
	const sorted = [route("/:path*"), route("/")].sort(compareRoutes);
	expect(sorted.map((r) => r.routePath)).toEqual(["/", "/:path*"]);
});
