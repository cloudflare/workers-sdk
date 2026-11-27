import { describe, it } from "vitest";
import {
	getHostnameFromRoute,
	getWorkerRouteHostname,
	getWorkerZone,
} from "../src/route-utils";

describe("getWorkerZone", () => {
	it("uses the first domain before any fetch trigger", ({ expect }) => {
		expect(
			getWorkerZone({
				domains: [{ hostname: "app.example.com" }, "other.example.com"],
				triggers: [{ type: "fetch", pattern: "api.example.net/*" }],
			})
		).toBe("app.example.com");
	});

	it("uses the first fetch trigger's pattern", ({ expect }) => {
		expect(
			getWorkerZone({
				triggers: [
					{ type: "scheduled" },
					{ type: "fetch", pattern: "api.example.com/*", zone: "zone-id" },
					{ type: "fetch", pattern: "other.example.com/*" },
				],
			})
		).toBe("api.example.com");
	});

	it("uses a fetch trigger's zone when it is a zone name", ({ expect }) => {
		expect(
			getWorkerZone({
				triggers: [
					{ type: "fetch", pattern: "api.example.com/*", zone: "example.com" },
				],
			})
		).toBe("example.com");
	});

	it("returns undefined without a domain or fetch trigger", ({ expect }) => {
		expect(getWorkerZone({ triggers: [{ type: "queue" }] })).toBeUndefined();
	});
});

describe("getWorkerRouteHostname", () => {
	it("uses the first domain before any fetch trigger", ({ expect }) => {
		expect(
			getWorkerRouteHostname({
				domains: [{ hostname: "app.example.com" }],
				triggers: [{ type: "fetch", pattern: "api.example.net/*" }],
			})
		).toBe("app.example.com");
	});

	it("uses the fetch trigger's pattern rather than its zone", ({ expect }) => {
		expect(
			getWorkerRouteHostname({
				triggers: [
					{ type: "fetch", pattern: "api.example.com/*", zone: "example.com" },
				],
			})
		).toBe("api.example.com");
	});

	it("returns undefined without a domain or fetch trigger", ({ expect }) => {
		expect(
			getWorkerRouteHostname({ triggers: [{ type: "queue" }] })
		).toBeUndefined();
	});
});

describe("getHostnameFromRoute", () => {
	it("drops wildcards, paths and ports", ({ expect }) => {
		expect(getHostnameFromRoute("*.example.com:8080/images/*")).toBe(
			"example.com"
		);
		expect(
			getHostnameFromRoute({
				pattern: "app.example.com/*",
				zone_name: "example.com",
			})
		).toBe("app.example.com");
	});

	it("returns undefined for routes without a hostname", ({ expect }) => {
		expect(getHostnameFromRoute("*/*")).toBeUndefined();
	});
});
