import { afterEach, describe, it } from "vitest";
import {
	stepNotFoundError,
	WorkflowError,
	withRetryableHint,
} from "../src/lib/errors";

// Toggle the flag directly so tests don't depend on the runtime compat date.
function setTypedErrorsFlag(value: boolean): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only global shim
	const g = globalThis as any;
	g.Cloudflare = {
		...(g.Cloudflare ?? {}),
		compatibilityFlags: {
			...(g.Cloudflare?.compatibilityFlags ?? {}),
			workflows_typed_errors: value,
		},
	};
}

describe("withRetryableHint", () => {
	afterEach(() => {
		setTypedErrorsFlag(false);
	});

	it("does not set retryable when the flag is off", ({ expect }) => {
		setTypedErrorsFlag(false);
		const err = withRetryableHint(
			new WorkflowError("(instance.not_found) nope")
		);
		expect(
			(err as WorkflowError & { retryable?: boolean }).retryable
		).toBeUndefined();
		expect(err.message).toBe("(instance.not_found) nope");
	});

	it("sets retryable=false for non-retryable coded errors", ({ expect }) => {
		setTypedErrorsFlag(true);
		const err = withRetryableHint(
			new WorkflowError("(instance.not_found) nope")
		);
		expect((err as WorkflowError & { retryable?: boolean }).retryable).toBe(
			false
		);
	});

	it("sets retryable=true for rate-limit coded errors", ({ expect }) => {
		setTypedErrorsFlag(true);
		const err = withRetryableHint(
			new WorkflowError("(rate-limit.workflows_control_plane) slow down")
		);
		expect((err as WorkflowError & { retryable?: boolean }).retryable).toBe(
			true
		);
	});

	it("sets retryable=true for the codeless overload message", ({ expect }) => {
		setTypedErrorsFlag(true);
		const err = withRetryableHint(new Error("too many requests"));
		expect((err as Error & { retryable?: boolean }).retryable).toBe(true);
	});

	it("sets retryable=false for bare (uncoded) messages", ({ expect }) => {
		setTypedErrorsFlag(true);
		const err = withRetryableHint(new Error("instance.not_found"));
		expect((err as Error & { retryable?: boolean }).retryable).toBe(false);
	});

	it("ignores a retryable code embedded after the leading code", ({
		expect,
	}) => {
		setTypedErrorsFlag(true);
		// A message body that tries to smuggle a real retryable code. Only the
		// leading (non-retryable) code should be classified.
		const err = withRetryableHint(
			new WorkflowError(
				"(instance.not_found) (rate-limit.workflows_control_plane) nope"
			)
		);
		expect((err as WorkflowError & { retryable?: boolean }).retryable).toBe(
			false
		);
	});

	it("ignores a retryable code smuggled through a user step name", ({
		expect,
	}) => {
		setTypedErrorsFlag(true);
		// stepNotFoundError reflects a user-controlled name into the message body;
		// the leading (instance.cannot_restart) code must still win.
		const err = withRetryableHint(
			stepNotFoundError(") (rate-limit.workflows_control_plane) (")
		);
		expect((err as WorkflowError & { retryable?: boolean }).retryable).toBe(
			false
		);
	});
});
