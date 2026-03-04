import { describe, expect, it } from "vitest";
import { MetricsRegistry } from "../../src/metrics";

describe("MetricsRegistry", () => {
	it("should create and increment a counter", () => {
		const registry = new MetricsRegistry();
		const counter = registry.create("counter", "test_counter", "A test counter");
		counter.inc();
		counter.inc(2);

		const metrics = registry.metrics();
		expect(metrics).toContain("# HELP test_counter A test counter");
		expect(metrics).toContain("# TYPE test_counter counter");
		expect(metrics).toContain("test_counter 3");
	});

	it("should support multiple counters", () => {
		const registry = new MetricsRegistry();
		const c1 = registry.create("counter", "c1", "help 1");
		const c2 = registry.create("counter", "c2", "help 2");

		c1.inc(10);
		c2.inc(20);

		const metrics = registry.metrics();
		expect(metrics).toContain("c1 10");
		expect(metrics).toContain("c2 20");
	});

	it("should throw for unsupported metric types", () => {
		const registry = new MetricsRegistry();
		// @ts-expect-error - testing invalid type
		expect(() => registry.create("gauge", "test", "help")).toThrow(
			"Unsupported metric type: gauge"
		);
	});

	it("should return existing counter if created with same name", () => {
		const registry = new MetricsRegistry();
		const c1 = registry.create("counter", "test", "help 1");
		const c2 = registry.create("counter", "test", "help 2");

		c1.inc(1);
		c2.inc(1);

		const metrics = registry.metrics();
		expect(metrics).toContain("test 2");
	});

	// Ported from promjs test suite
	it("should produce valid prometheus format", () => {
		const registry = new MetricsRegistry();
		const counter = registry.create("counter", "http_requests_total", "Total number of HTTP requests");
		counter.inc(1);

		const expected = [
			"# HELP http_requests_total Total number of HTTP requests",
			"# TYPE http_requests_total counter",
			"http_requests_total 1",
			""
		].join("\n");

		expect(registry.metrics()).toBe(expected);
	});
});
