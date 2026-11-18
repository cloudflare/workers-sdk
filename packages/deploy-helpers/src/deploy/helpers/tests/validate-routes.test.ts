import { beforeEach, describe, it, vi } from "vitest";
import { initDeployHelpersContext } from "../../../shared/context";
import { validateRoutes } from "../validate-routes";
import type { AssetsOptions, Route } from "@cloudflare/workers-utils";

const warn = vi.fn();

function assets(basePath?: string): AssetsOptions {
	return {
		directory: "/public",
		routerConfig: { invoke_user_worker_ahead_of_assets: true },
		assetConfig: { base_path: basePath },
	};
}

function validate(
	routes: Route[],
	basePath: string | undefined,
	workersDevEnabled = false
) {
	validateRoutes(routes, assets(basePath), workersDevEnabled);
}

describe("assets base path route validation", () => {
	beforeEach(() => {
		warn.mockReset();
		initDeployHelpersContext({
			logger: {
				debug() {},
				error() {},
				info() {},
				log() {},
				warn,
			},
			confirm: (() => {}) as never,
			fetchKVGetValue: (() => {}) as never,
			fetchListResult: (() => {}) as never,
			fetchPagedListResult: (() => {}) as never,
			fetchResult: (() => {}) as never,
			prompt: (() => {}) as never,
			select: (() => {}) as never,
		});
	});

	it("warns when no string route matches the base path", ({ expect }) => {
		validate(["example.com/api/*"], "/blog/");

		expect(warn).toHaveBeenCalledOnce();
		expect(warn).toHaveBeenCalledWith(
			'The configured assets base path "/blog/" is not reachable through any configured route. Add a route that matches "/blog/" or enable `workers_dev`.'
		);
	});

	it("does not warn when a route object matches the base path", ({
		expect,
	}) => {
		validate(
			[{ pattern: "example.com/blog/*", zone_id: "example-com-id" }],
			"/blog/"
		);

		expect(warn).not.toHaveBeenCalled();
	});

	it("does not warn for a host-wide route", ({ expect }) => {
		validate(["example.com/*"], "/blog/");

		expect(warn).not.toHaveBeenCalled();
	});

	it("does not warn when any of multiple routes matches", ({ expect }) => {
		validate(
			[
				"example.com/api/*",
				{ pattern: "example.net/blog/*", zone_name: "example.net" },
			],
			"/blog/"
		);

		expect(warn).not.toHaveBeenCalled();
	});

	it("treats custom domains as covering every path", ({ expect }) => {
		validate(
			[{ pattern: "assets.example.com", custom_domain: true }],
			"/blog/"
		);

		expect(warn).not.toHaveBeenCalled();
	});

	it("warns when a custom domain is disabled", ({ expect }) => {
		validate(
			[
				{
					pattern: "assets.example.com",
					custom_domain: true,
					enabled: false,
				},
			],
			"/blog/"
		);

		expect(warn).toHaveBeenCalledOnce();
	});

	it("does not warn when workers.dev is enabled", ({ expect }) => {
		validate(["example.com/api/*"], "/blog/", true);

		expect(warn).not.toHaveBeenCalled();
	});

	it("does not warn for the root base path", ({ expect }) => {
		validate(["example.com/api/*"], "/");

		expect(warn).not.toHaveBeenCalled();
	});

	it("does not warn when the base path is omitted", ({ expect }) => {
		validate(["example.com/api/*"], undefined);

		expect(warn).not.toHaveBeenCalled();
	});

	it("does not warn when the base path is semantically invalid", ({
		expect,
	}) => {
		validate(["example.com/api/*"], "https://example.com/blog/");

		expect(warn).not.toHaveBeenCalled();
	});
});
