import { describe, it } from "vitest";
import { MetricsRegistry } from "../src/prometheus-metrics";

describe("MetricsRegistry", () => {
	describe("createCounter", () => {
		it("returns an object with inc and add methods", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("test_total", "A test counter");
			expect(counter).toHaveProperty("inc");
			expect(counter).toHaveProperty("add");
			expect(typeof counter.inc).toBe("function");
			expect(typeof counter.add).toBe("function");
		});

		it("allows creating multiple counters on the same registry", ({
			expect,
		}) => {
			const registry = new MetricsRegistry();
			const c1 = registry.createCounter("first_total", "First");
			const c2 = registry.createCounter("second_total", "Second");
			c1.inc();
			c2.inc();
			expect(registry.metrics()).toContain("first_total 1");
			expect(registry.metrics()).toContain("second_total 1");
		});
	});

	describe("Counter.inc", () => {
		it("increments the counter value by 1", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("test_total", "A test counter");
			counter.inc();
			expect(registry.metrics()).toContain("test_total 1\n");
		});

		it("accumulates across multiple calls", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("test_total", "A test counter");
			counter.inc();
			counter.inc();
			counter.inc();
			expect(registry.metrics()).toContain("test_total 3\n");
		});
	});

	describe("Counter.add", () => {
		it("increments by the specified amount", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("test_total", "A test counter");
			counter.add(5);
			expect(registry.metrics()).toContain("test_total 5\n");
		});

		it("works with fractional values", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("test_total", "A test counter");
			counter.add(0.5);
			counter.add(1.5);
			expect(registry.metrics()).toContain("test_total 2\n");
		});

		it("accepts zero", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("test_total", "A test counter");
			counter.add(0);
			expect(registry.metrics()).toContain("test_total 0\n");
		});

		it("throws on negative values", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("test_total", "A test counter");
			expect(() => counter.add(-1)).toThrowError(
				"Counter value cannot decrease"
			);
		});

		it("can be combined with inc", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("test_total", "A test counter");
			counter.inc();
			counter.add(4);
			counter.inc();
			expect(registry.metrics()).toContain("test_total 6\n");
		});
	});

	describe("metrics", () => {
		it("returns empty string for an empty registry", ({ expect }) => {
			const registry = new MetricsRegistry();
			expect(registry.metrics()).toBe("");
		});

		it("formats a counter that was never incremented with value 0", ({
			expect,
		}) => {
			const registry = new MetricsRegistry();
			registry.createCounter("test_total", "A test counter");
			expect(registry.metrics()).toBe(
				"# HELP test_total A test counter\n" +
					"# TYPE test_total counter\n" +
					"test_total 0\n"
			);
		});

		it("formats a single counter incremented once", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("test_total", "A test counter");
			counter.inc();
			expect(registry.metrics()).toBe(
				"# HELP test_total A test counter\n" +
					"# TYPE test_total counter\n" +
					"test_total 1\n"
			);
		});

		it("formats a counter with accumulated value", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("test_total", "A test counter");
			counter.add(42);
			expect(registry.metrics()).toBe(
				"# HELP test_total A test counter\n" +
					"# TYPE test_total counter\n" +
					"test_total 42\n"
			);
		});

		it("omits HELP line when help string is empty", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("test_total", "");
			counter.inc();
			expect(registry.metrics()).toBe(
				"# TYPE test_total counter\n" + "test_total 1\n"
			);
		});

		it("includes HELP line when help is provided", ({ expect }) => {
			const registry = new MetricsRegistry();
			registry.createCounter("test_total", "Some help text");
			expect(registry.metrics()).toContain(
				"# HELP test_total Some help text\n"
			);
		});

		it("always includes TYPE line", ({ expect }) => {
			const registry = new MetricsRegistry();
			registry.createCounter("test_total", "");
			expect(registry.metrics()).toContain("# TYPE test_total counter\n");
		});

		it("terminates each line with newline", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("test_total", "Help");
			counter.inc();
			const lines = registry.metrics().split("\n");
			// Last split element is empty string after trailing newline
			expect(lines[lines.length - 1]).toBe("");
			// All non-empty lines should have been newline-terminated
			expect(lines.slice(0, -1).every((l) => l.length > 0)).toBe(true);
		});

		it("handles metric names with underscores", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter(
				"devprod_edge_preview_authenticated_proxy_request_total",
				"Request counter"
			);
			counter.inc();
			expect(registry.metrics()).toContain(
				"devprod_edge_preview_authenticated_proxy_request_total 1\n"
			);
		});

		it("handles help text with spaces and punctuation", ({ expect }) => {
			const registry = new MetricsRegistry();
			registry.createCounter(
				"test_total",
				"Request counter for DevProd's edge-preview-authenticated-proxy service"
			);
			expect(registry.metrics()).toContain(
				"# HELP test_total Request counter for DevProd's edge-preview-authenticated-proxy service\n"
			);
		});
	});

	describe("multiple counters", () => {
		it("serializes counters in creation order", ({ expect }) => {
			const registry = new MetricsRegistry();
			const c1 = registry.createCounter("first_total", "First counter");
			const c2 = registry.createCounter("second_total", "Second counter");
			c1.inc();
			c2.inc();

			const output = registry.metrics();
			const firstIndex = output.indexOf("first_total");
			const secondIndex = output.indexOf("second_total");
			expect(firstIndex).toBeLessThan(secondIndex);
		});

		it("each counter has independent HELP, TYPE, and value lines", ({
			expect,
		}) => {
			const registry = new MetricsRegistry();
			const c1 = registry.createCounter("first_total", "First");
			const c2 = registry.createCounter("second_total", "Second");
			c1.inc();
			c2.add(5);

			expect(registry.metrics()).toBe(
				"# HELP first_total First\n" +
					"# TYPE first_total counter\n" +
					"first_total 1\n" +
					"# HELP second_total Second\n" +
					"# TYPE second_total counter\n" +
					"second_total 5\n"
			);
		});

		it("counters track independent values", ({ expect }) => {
			const registry = new MetricsRegistry();
			const c1 = registry.createCounter("first_total", "First");
			const c2 = registry.createCounter("second_total", "Second");

			c1.add(100);
			expect(registry.metrics()).toContain("second_total 0\n");

			c2.inc();
			expect(registry.metrics()).toContain("first_total 100\n");
			expect(registry.metrics()).toContain("second_total 1\n");
		});
	});

	// This prometheus-metrics module is an (almost) drop-in replacement for promjs,
	// so we include tests to verify that the output format matches promjs's exactly.
	// This ensures compatibility with any existing Prometheus parsers that may be sensitive to formatting details.
	describe("promjs format compatibility", () => {
		it("produces the exact format promjs generates for a request counter", ({
			expect,
		}) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter(
				"devprod_edge_preview_authenticated_proxy_request_total",
				"Request counter for DevProd's edge-preview-authenticated-proxy service"
			);
			counter.inc();

			// This is the exact output promjs produces for a counter with value 1 and no labels
			expect(registry.metrics()).toBe(
				"# HELP devprod_edge_preview_authenticated_proxy_request_total " +
					"Request counter for DevProd's edge-preview-authenticated-proxy service\n" +
					"# TYPE devprod_edge_preview_authenticated_proxy_request_total counter\n" +
					"devprod_edge_preview_authenticated_proxy_request_total 1\n"
			);
		});

		it("produces the exact format for the typical usage pattern: request + error counters", ({
			expect,
		}) => {
			// Simulates the exact usage pattern in edge-preview-authenticated-proxy
			const registry = new MetricsRegistry();

			const requestCounter = registry.createCounter(
				"devprod_edge_preview_authenticated_proxy_request_total",
				"Request counter for DevProd's edge-preview-authenticated-proxy service"
			);
			requestCounter.inc();

			const errorCounter = registry.createCounter(
				"devprod_edge_preview_authenticated_proxy_error_total",
				"Error counter for DevProd's edge-preview-authenticated-proxy service"
			);
			errorCounter.inc();

			expect(registry.metrics()).toBe(
				"# HELP devprod_edge_preview_authenticated_proxy_request_total " +
					"Request counter for DevProd's edge-preview-authenticated-proxy service\n" +
					"# TYPE devprod_edge_preview_authenticated_proxy_request_total counter\n" +
					"devprod_edge_preview_authenticated_proxy_request_total 1\n" +
					"# HELP devprod_edge_preview_authenticated_proxy_error_total " +
					"Error counter for DevProd's edge-preview-authenticated-proxy service\n" +
					"# TYPE devprod_edge_preview_authenticated_proxy_error_total counter\n" +
					"devprod_edge_preview_authenticated_proxy_error_total 1\n"
			);
		});

		it("produces the exact format for a request-only scenario (no errors)", ({
			expect,
		}) => {
			// Simulates a successful request where only the request counter is created
			const registry = new MetricsRegistry();

			const requestCounter = registry.createCounter(
				"devprod_edge_preview_authenticated_proxy_request_total",
				"Request counter for DevProd's edge-preview-authenticated-proxy service"
			);
			requestCounter.inc();

			expect(registry.metrics()).toBe(
				"# HELP devprod_edge_preview_authenticated_proxy_request_total " +
					"Request counter for DevProd's edge-preview-authenticated-proxy service\n" +
					"# TYPE devprod_edge_preview_authenticated_proxy_request_total counter\n" +
					"devprod_edge_preview_authenticated_proxy_request_total 1\n"
			);
		});
	});

	/**
	 * Tests ported from the original promjs test suite to ensure behavioral compatibility.
	 *
	 * Original source (Apache-2.0 license):
	 * - https://github.com/weaveworks/promjs/blob/master/test/registry-test.ts
	 * - https://github.com/weaveworks/promjs/blob/master/test/counter-test.ts
	 * - https://github.com/weaveworks/promjs/blob/master/test/integration-test.ts
	 */
	describe("ported from promjs test suite", () => {
		// Ported from registry-test.ts: "renders metrics to prometheus format"
		it("renders metrics to prometheus format", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter(
				"my_counter",
				"A counter for things"
			);

			let desired = "# HELP my_counter A counter for things\n";
			desired += "# TYPE my_counter counter\n";
			desired += "my_counter 5\n";

			counter.add(5);
			expect(registry.metrics()).toBe(desired);
		});

		// Ported from counter-test.ts: "increments a value"
		it("increments a counter value by 1", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("my_counter", "A counter");
			counter.inc();
			expect(registry.metrics()).toContain("my_counter 1\n");
		});

		// Ported from counter-test.ts: "adds a value"
		it("adds a specific value to a counter", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("my_counter", "A counter");
			counter.add(5);
			expect(registry.metrics()).toContain("my_counter 5\n");
		});

		// Ported from counter-test.ts: "ensures value is >= 0"
		it("ensures counter add value is >= 0", ({ expect }) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("my_counter", "A counter");
			expect(() => counter.add(-5)).toThrow();
		});

		// Ported from integration-test.ts: counter portion of "reports metrics"
		it("reports counter metrics in prometheus format (integration)", ({
			expect,
		}) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter(
				"my_counter",
				"A counter for things"
			);

			counter.inc();
			// In promjs, counter.add(2, labels) creates a separate labeled series.
			// Our implementation only supports unlabeled counters, so we verify
			// the unlabeled portion of the integration test.
			counter.add(2);

			const actual = registry.metrics();
			expect(actual).toContain("# HELP my_counter A counter for things\n");
			expect(actual).toContain("# TYPE my_counter counter\n");
			expect(actual).toContain("my_counter 3\n");
		});

		// Ported from integration-test.ts: counter format after reset
		// Our registry is ephemeral (created fresh per request), so instead of
		// testing reset we verify that a freshly created counter starts at 0.
		it("counter starts at zero before any increments", ({ expect }) => {
			const registry = new MetricsRegistry();
			registry.createCounter("my_counter", "A counter for things");

			const output = registry.metrics();
			expect(output).toContain("my_counter 0\n");
		});

		// Ported from registry-test.ts: "clear all the metrics"
		// Our registry doesn't have clear(), but an empty registry has the
		// same behavior as a cleared one — metrics() returns "".
		it("empty registry produces no output, equivalent to promjs clear", ({
			expect,
		}) => {
			const registry = new MetricsRegistry();
			expect(registry.metrics()).toBe("");
		});

		// Derived from registry-test.ts: "reset all the metrics"
		// Since our registry is ephemeral, a new registry is the equivalent
		// of reset — counters start at 0 and can be incremented from there.
		it("new registry with counter at 0 is equivalent to promjs reset", ({
			expect,
		}) => {
			const registry = new MetricsRegistry();
			const counter = registry.createCounter("my_counter", "A counter");
			expect(registry.metrics()).toContain("my_counter 0");
			counter.inc();
			expect(registry.metrics()).toContain("my_counter 1");
		});

		// Ported from integration-test.ts: verifies all non-HELP/TYPE lines
		// end with a numeric value (the core format contract).
		it("all value lines end with a numeric value", ({ expect }) => {
			const registry = new MetricsRegistry();
			const c1 = registry.createCounter("counter_a", "Counter A");
			const c2 = registry.createCounter("counter_b", "Counter B");
			c1.inc();
			c1.add(4);
			c2.add(10);

			const lines = registry.metrics().split("\n").filter(Boolean);
			for (const line of lines) {
				if (!line.startsWith("#")) {
					expect(line).toMatch(/\s\d+$/);
				}
			}
		});
	});
});
