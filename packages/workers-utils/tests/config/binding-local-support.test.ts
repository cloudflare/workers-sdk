import { beforeEach, describe, it, vi } from "vitest";
import {
	resolveBindingRemote,
	validateBindingRemoteSetting,
} from "../../src/config/binding-local-support";
import type { Binding } from "../../src/types";

describe("resolveBindingRemote", () => {
	it.for<{
		type: Binding["type"];
		remote: boolean | undefined;
		remoteBindingsDisabled: boolean;
		expected: boolean;
	}>([
		// Remote by default with local opt-in.
		{
			type: "artifacts",
			remote: undefined,
			remoteBindingsDisabled: false,
			expected: true,
		},
		{
			type: "artifacts",
			remote: true,
			remoteBindingsDisabled: false,
			expected: true,
		},
		{
			type: "artifacts",
			remote: false,
			remoteBindingsDisabled: false,
			expected: false,
		},
		{
			type: "artifacts",
			remote: undefined,
			remoteBindingsDisabled: true,
			expected: false,
		},
		{
			type: "artifacts",
			remote: true,
			remoteBindingsDisabled: true,
			expected: false,
		},
		{
			type: "artifacts",
			remote: false,
			remoteBindingsDisabled: true,
			expected: false,
		},
		// Local by default with remote opt-in.
		{
			type: "kv_namespace",
			remote: undefined,
			remoteBindingsDisabled: false,
			expected: false,
		},
		{
			type: "kv_namespace",
			remote: true,
			remoteBindingsDisabled: false,
			expected: true,
		},
		{
			type: "kv_namespace",
			remote: true,
			remoteBindingsDisabled: true,
			expected: false,
		},
		{
			type: "vectorize",
			remote: true,
			remoteBindingsDisabled: false,
			expected: true,
		},
		{
			type: "vectorize",
			remote: undefined,
			remoteBindingsDisabled: false,
			expected: false,
		},
		// Fixed modes ignore the setting.
		{
			type: "ratelimit",
			remote: true,
			remoteBindingsDisabled: false,
			expected: false,
		},
		{
			type: "ai",
			remote: undefined,
			remoteBindingsDisabled: false,
			expected: true,
		},
		{
			type: "ai",
			remote: undefined,
			remoteBindingsDisabled: true,
			expected: true,
		},
	])(
		"$type with remote=$remote and remoteBindingsDisabled=$remoteBindingsDisabled is remote: $expected",
		({ type, remote, remoteBindingsDisabled, expected }, { expect }) => {
			expect(
				resolveBindingRemote(type, remote, { remoteBindingsDisabled })
			).toBe(expected);
		}
	);
});

describe("validateBindingRemoteSetting", () => {
	const warn = vi.fn();

	beforeEach(() => warn.mockClear());

	describe("local-only bindings", () => {
		it("throws when `remote: true` is set", ({ expect }) => {
			expect(() =>
				validateBindingRemoteSetting("ratelimit", true, warn)
			).toThrow(
				"Rate Limit bindings do not support accessing remote resources."
			);
		});

		it("does not throw or warn otherwise", ({ expect }) => {
			expect(() =>
				validateBindingRemoteSetting("ratelimit", false, warn)
			).not.toThrow();
			expect(() =>
				validateBindingRemoteSetting("ratelimit", undefined, warn)
			).not.toThrow();
			expect(warn).not.toHaveBeenCalled();
		});
	});

	describe("remote-only bindings without a local simulator yet", () => {
		it("throws when `remote: false` is set", ({ expect }) => {
			expect(() =>
				validateBindingRemoteSetting("vectorize", false, warn)
			).toThrow(
				"Vectorize Index bindings do not support local development. You can set `remote: true` for the binding definition in your configuration file to access a remote version of the resource."
			);
		});

		it("warns when `remote` is omitted", ({ expect }) => {
			validateBindingRemoteSetting("vectorize", undefined, warn);
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining(
					"Vectorize Index bindings do not support local development"
				)
			);
		});

		it("does not throw or warn when `remote: true` is set", ({ expect }) => {
			expect(() =>
				validateBindingRemoteSetting("vectorize", true, warn)
			).not.toThrow();
			expect(warn).not.toHaveBeenCalled();
		});
	});

	describe("always-remote bindings", () => {
		it("throws when `remote: false` is set", ({ expect }) => {
			expect(() => validateBindingRemoteSetting("ai", false, warn)).toThrow(
				"AI bindings do not support local development. You can set `remote: true` for the binding definition in your configuration file to access a remote version of the resource."
			);
		});

		it("warns about usage charges when `remote` is omitted", ({ expect }) => {
			validateBindingRemoteSetting("ai", undefined, warn);
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining(
					"AI bindings always access remote resources, and so may incur usage charges even in local dev"
				)
			);
		});

		it("does not throw or warn when `remote: true` is set", ({ expect }) => {
			expect(() =>
				validateBindingRemoteSetting("ai", true, warn)
			).not.toThrow();
			expect(warn).not.toHaveBeenCalled();
		});
	});

	describe("local-and-remote bindings", () => {
		it("does not throw or warn", ({ expect }) => {
			expect(() =>
				validateBindingRemoteSetting("kv_namespace", true, warn)
			).not.toThrow();
			expect(() =>
				validateBindingRemoteSetting("kv_namespace", false, warn)
			).not.toThrow();
			expect(() =>
				validateBindingRemoteSetting("kv_namespace", undefined, warn)
			).not.toThrow();
			expect(() =>
				validateBindingRemoteSetting("flagship", undefined, warn)
			).not.toThrow();
			expect(warn).not.toHaveBeenCalled();
		});
	});

	describe("remote-default bindings with local opt-in", () => {
		it("warns when `remote` is omitted, naming the binding", ({ expect }) => {
			validateBindingRemoteSetting("artifacts", undefined, warn, {
				binding: "REPOS",
			});
			expect(warn).toHaveBeenCalledWith(
				"Artifacts binding REPOS uses the deployed resource. Set `remote: false` to use the local simulator, or `remote: true` to silence this warning."
			);
		});

		it("does not warn when remote bindings are disabled", ({ expect }) => {
			validateBindingRemoteSetting("artifacts", undefined, warn, {
				binding: "REPOS",
				remoteBindingsDisabled: true,
			});
			expect(warn).not.toHaveBeenCalled();
		});

		it("does not throw or warn for an explicit setting", ({ expect }) => {
			for (const remote of [true, false]) {
				expect(() =>
					validateBindingRemoteSetting("artifacts", remote, warn)
				).not.toThrow();
			}
			expect(warn).not.toHaveBeenCalled();
		});
	});
});
