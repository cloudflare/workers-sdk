import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildInspectorUrl } from "../dev/inspect";
import { writeMetricsConfig } from "../metrics/metrics-config";
import { runInTempDir } from "./helpers/run-in-tmp";

vi.mock("../metrics/helpers", () => ({
	getWranglerVersion: () => "1.2.3",
}));

describe("inspect", () => {
	runInTempDir({ homedir: "foo" });

	describe("buildInspectorUrl", () => {
		beforeEach(() => {
			// Reset metrics config before each test
			writeMetricsConfig({});
		});

		it("should build a URL with basic parameters", () => {
			writeMetricsConfig({
				permission: {
					enabled: false,
					date: new Date(),
				},
			});

			const url = buildInspectorUrl(9229, "my-worker");
			const parsed = new URL(url);

			expect(parsed.origin).toBe("https://devtools.devprod.cloudflare.dev");
			expect(parsed.pathname).toBe("/js_app");
			expect(parsed.searchParams.get("theme")).toBe("systemPreferred");
			expect(parsed.searchParams.get("ws")).toBe("127.0.0.1:9229/ws");
			expect(parsed.searchParams.get("domain")).toBe("my-worker");
			expect(parsed.searchParams.get("debugger")).toBe("true");
		});

		it("should include telemetry=false when telemetry is disabled", () => {
			writeMetricsConfig({
				permission: {
					enabled: false,
					date: new Date(),
				},
				deviceId: "test-device-id",
			});

			const url = buildInspectorUrl(9229, "my-worker");
			const parsed = new URL(url);

			expect(parsed.searchParams.get("telemetry")).toBe("false");
			// deviceId should NOT be included when telemetry is disabled
			expect(parsed.searchParams.has("deviceId")).toBe(false);
		});

		it("should include telemetry=true and deviceId when telemetry is enabled", () => {
			writeMetricsConfig({
				permission: {
					enabled: true,
					date: new Date(),
				},
				deviceId: "test-device-id",
			});

			const url = buildInspectorUrl(9229, "my-worker");
			const parsed = new URL(url);

			expect(parsed.searchParams.get("telemetry")).toBe("true");
			expect(parsed.searchParams.get("deviceId")).toBe("test-device-id");
		});

		it("should include sourceKey when telemetry is enabled and SPARROW_SOURCE_KEY is set", () => {
			vi.stubEnv("SPARROW_SOURCE_KEY", "test-source-key");

			writeMetricsConfig({
				permission: {
					enabled: true,
					date: new Date(),
				},
				deviceId: "test-device-id",
			});

			const url = buildInspectorUrl(9229, "my-worker");
			const parsed = new URL(url);

			expect(parsed.searchParams.get("sourceKey")).toBe("test-source-key");
		});

		it("should not include sourceKey when telemetry is disabled", () => {
			vi.stubEnv("SPARROW_SOURCE_KEY", "test-source-key");

			writeMetricsConfig({
				permission: {
					enabled: false,
					date: new Date(),
				},
				deviceId: "test-device-id",
			});

			const url = buildInspectorUrl(9229, "my-worker");
			const parsed = new URL(url);

			expect(parsed.searchParams.has("sourceKey")).toBe(false);
		});

		it("should include wranglerVersion in the URL", () => {
			writeMetricsConfig({
				permission: {
					enabled: true,
					date: new Date(),
				},
			});

			const url = buildInspectorUrl(9229, "my-worker");
			const parsed = new URL(url);

			expect(parsed.searchParams.get("wranglerVersion")).toBe("1.2.3");
		});

		it("should handle undefined worker name", () => {
			writeMetricsConfig({
				permission: {
					enabled: true,
					date: new Date(),
				},
			});

			const url = buildInspectorUrl(9229, undefined);
			const parsed = new URL(url);

			expect(parsed.searchParams.has("domain")).toBe(false);
		});

		it("should default to telemetry=false when no permission is set", () => {
			// Empty config - no permission set
			writeMetricsConfig({});

			const url = buildInspectorUrl(9229, "my-worker");
			const parsed = new URL(url);

			expect(parsed.searchParams.get("telemetry")).toBe("false");
		});

		it("should use different inspector ports correctly", () => {
			writeMetricsConfig({
				permission: {
					enabled: false,
					date: new Date(),
				},
			});

			const url1 = buildInspectorUrl(9229, "worker1");
			const url2 = buildInspectorUrl(8080, "worker2");

			const parsed1 = new URL(url1);
			const parsed2 = new URL(url2);

			expect(parsed1.searchParams.get("ws")).toBe("127.0.0.1:9229/ws");
			expect(parsed2.searchParams.get("ws")).toBe("127.0.0.1:8080/ws");
		});
	});
});
