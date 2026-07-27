import { describe, it } from "vitest";
import {
	canonicalizePath,
	PathNormalization,
} from "../src/utils/canonical-path";

describe("canonicalizePath", () => {
	it("decodes once and collapses repeated slashes", ({ expect }) => {
		const path = canonicalizePath("//%65xample%2Freport.json");

		expect(path.routingPath).toBe("/example/report.json");
		expect(path.assetPath).toBe("/example/report.json");
		expect(path.normalization).toBe(
			PathNormalization.Decoded | PathNormalization.CollapsedSlashes
		);
	});

	it("does not double-decode asset names", ({ expect }) => {
		const path = canonicalizePath("/%252Freport.json");

		expect(path.routingPath).toBe("/%252Freport.json");
		expect(path.assetPath).toBe("/%2Freport.json");
		expect(path.normalization).toBe(
			PathNormalization.Decoded | PathNormalization.Reencoded
		);
	});

	it("re-encodes literal characters that have an encoded routing spelling", ({
		expect,
	}) => {
		const path = canonicalizePath("/docs+draft");

		expect(path.routingPath).toBe("/docs%2Bdraft");
		expect(path.assetPath).toBe("/docs+draft");
		expect(path.normalization).toBe(PathNormalization.Reencoded);
	});

	it("records malformed percent-encoding", ({ expect }) => {
		const path = canonicalizePath("/%");

		expect(path.routingPath).toBe("/%25");
		expect(path.assetPath).toBe("/%");
		expect(path.normalization).toBe(
			PathNormalization.MalformedEncoding | PathNormalization.Reencoded
		);
	});

	it("does not throw for an invalid Unicode character", ({ expect }) => {
		expect(() => canonicalizePath("/\uD800")).not.toThrow();
	});
});
