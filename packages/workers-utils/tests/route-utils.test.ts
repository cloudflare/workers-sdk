import { describe, it } from "vitest";
import { getWorkerZone } from "../src/route-utils";

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
