import { beforeEach, describe, it, vi } from "vitest";
import { warnOrError } from "../../src/config/binding-local-support";

describe("warnOrError", () => {
	const warn = vi.fn();

	beforeEach(() => warn.mockClear());

	describe("local-only bindings", () => {
		it("throws when `remote: true` is set", ({ expect }) => {
			expect(() => warnOrError("ratelimit", true, warn)).toThrow(
				"Rate Limit bindings do not support accessing remote resources."
			);
		});

		it("does not throw or warn otherwise", ({ expect }) => {
			expect(() => warnOrError("ratelimit", false, warn)).not.toThrow();
			expect(() => warnOrError("ratelimit", undefined, warn)).not.toThrow();
			expect(warn).not.toHaveBeenCalled();
		});
	});

	describe("remote-only bindings without a local simulator yet", () => {
		it("throws when `remote: false` is set", ({ expect }) => {
			expect(() => warnOrError("vectorize", false, warn)).toThrow(
				"Vectorize Index bindings do not support local development. You can set `remote: true` for the binding definition in your configuration file to access a remote version of the resource."
			);
		});

		it("warns when `remote` is omitted", ({ expect }) => {
			warnOrError("vectorize", undefined, warn);
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining(
					"Vectorize Index bindings do not support local development"
				)
			);
		});

		it("does not throw or warn when `remote: true` is set", ({ expect }) => {
			expect(() => warnOrError("vectorize", true, warn)).not.toThrow();
			expect(warn).not.toHaveBeenCalled();
		});
	});

	describe("always-remote bindings", () => {
		it("throws when `remote: false` is set", ({ expect }) => {
			expect(() => warnOrError("ai", false, warn)).toThrow(
				"AI bindings do not support local development. You can set `remote: true` for the binding definition in your configuration file to access a remote version of the resource."
			);
		});

		it("warns about usage charges when `remote` is omitted", ({ expect }) => {
			warnOrError("ai", undefined, warn);
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining(
					"AI bindings always access remote resources, and so may incur usage charges even in local dev"
				)
			);
		});

		it("does not throw or warn when `remote: true` is set", ({ expect }) => {
			expect(() => warnOrError("ai", true, warn)).not.toThrow();
			expect(warn).not.toHaveBeenCalled();
		});
	});

	describe("local-and-remote bindings", () => {
		it("does not throw or warn", ({ expect }) => {
			expect(() => warnOrError("kv_namespace", true, warn)).not.toThrow();
			expect(() => warnOrError("kv_namespace", false, warn)).not.toThrow();
			expect(() => warnOrError("kv_namespace", undefined, warn)).not.toThrow();
			expect(warn).not.toHaveBeenCalled();
		});
	});
});
