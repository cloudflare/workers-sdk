import { describe, test } from "vitest";
import {
	createInboxRefreshCoordinator,
	getEmailResendErrorFeedback,
	getEmailResendFeedback,
	getEmailResendNetworkFeedback,
	toTestEmailDraft,
} from "../../utils/email-resend";

interface Deferred<T> {
	promise: Promise<T>;
	reject: (cause: unknown) => void;
	resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
	let resolvePromise: ((value: T) => void) | undefined;
	let rejectPromise: ((cause: unknown) => void) | undefined;
	const promise = new Promise<T>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return {
		promise,
		reject: (cause) => rejectPromise?.(cause),
		resolve: (value) => resolvePromise?.(value),
	};
}

function at<T>(values: T[], index: number): T {
	const value = values[index];
	if (value === undefined) {
		throw new Error(`Missing deferred value at index ${index}.`);
	}
	return value;
}

async function flushPromises(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe("email resend UI helpers", () => {
	test("converts projected composer fields and attachment sizes", ({
		expect,
	}) => {
		const draft = toTestEmailDraft({
			attachments: [
				{
					content: "AAECAwQ=",
					contentId: "image-1",
					disposition: "inline",
					filename: "image.bin",
					type: "application/octet-stream",
				},
			],
			cc: ["copy@example.com"],
			from: "sender@example.com",
			headers: { "X-Test": "value" },
			html: "<p>Hello</p>",
			replyTo: "reply@example.com",
			subject: "Projected email",
			text: "Hello",
			to: ["first@example.com", "second@example.com"],
		});

		expect(draft).toMatchObject({
			attachments: [
				{
					content: "AAECAwQ=",
					contentId: "image-1",
					disposition: "inline",
					filename: "image.bin",
					size: 5,
					type: "application/octet-stream",
				},
			],
			bcc: "",
			cc: "copy@example.com",
			from: "sender@example.com",
			headers: [{ name: "X-Test", value: "value" }],
			html: "<p>Hello</p>",
			replyTo: "reply@example.com",
			subject: "Projected email",
			text: "Hello",
			to: "first@example.com, second@example.com",
		});
		expect(draft.attachments[0]?.id).toBeTruthy();
	});

	test("distinguishes success, rejection, and exception", ({ expect }) => {
		expect(
			getEmailResendFeedback({
				capturedPortion: false,
				messageId: "<new@example.com>",
				outcome: "ok",
			})
		).toEqual({
			description: undefined,
			title: "Email resent.",
			variant: "success",
		});
		expect(
			getEmailResendFeedback({
				capturedPortion: true,
				messageId: "<new@example.com>",
				outcome: "ok",
				rejectReason: "",
			})
		).toEqual({
			description:
				"No rejection reason was provided. Only the captured portion of the original email was available.",
			title: "Email was rejected.",
			variant: "error",
		});
		expect(
			getEmailResendFeedback({
				capturedPortion: true,
				messageId: "<new@example.com>",
				outcome: "exception",
			})
		).toEqual({
			description:
				"Only the captured portion of the original email was available.",
			title: "The email handler threw an exception.",
			variant: "error",
		});
	});

	test("does not claim ambiguous peer or network delivery failed", ({
		expect,
	}) => {
		expect(
			getEmailResendErrorFeedback(
				{ errors: [{ code: 10603, message: "Peer fetch failed" }] },
				502,
				true
			)
		).toEqual({
			description:
				"Only the captured portion of the original email was available.",
			title:
				"The resend result is unknown because the Worker peer became unavailable.",
			variant: "error",
		});
		expect(getEmailResendNetworkFeedback(false).title).toContain("unknown");
	});

	test("coalesces refresh bursts and runs one follow-up during a refresh", async ({
		expect,
	}) => {
		let active = 0;
		let maximumActive = 0;
		const refreshes = [
			deferred<"success" | "stale">(),
			deferred<"success" | "stale">(),
		];
		let refreshIndex = 0;
		const coordinator = createInboxRefreshCoordinator({
			currentGeneration: () => 1,
			isDisposed: () => false,
			refreshFirstPage: async () => {
				active++;
				maximumActive = Math.max(maximumActive, active);
				try {
					return await at(refreshes, refreshIndex++).promise;
				} finally {
					active--;
				}
			},
		});

		coordinator.request(1);
		coordinator.request(1);
		await flushPromises();
		expect(refreshIndex).toBe(1);
		coordinator.request(1);
		at(refreshes, 0).resolve("success");
		await flushPromises();
		expect(refreshIndex).toBe(2);
		expect(maximumActive).toBe(1);
		at(refreshes, 1).resolve("success");
		await flushPromises();
		expect(refreshIndex).toBe(2);
	});

	test("follows a failed refresh only for newer dirty work", async ({
		expect,
	}) => {
		const first = deferred<"success" | "stale">();
		const second = deferred<"success" | "stale">();
		const refreshes = [first, second];
		let refreshIndex = 0;
		const coordinator = createInboxRefreshCoordinator({
			currentGeneration: () => 1,
			isDisposed: () => false,
			refreshFirstPage: () => at(refreshes, refreshIndex++).promise,
		});

		coordinator.request(1);
		await flushPromises();
		coordinator.request(1);
		first.reject(new Error("refresh failed"));
		await flushPromises();
		expect(refreshIndex).toBe(2);
		second.resolve("success");
		await flushPromises();

		const loneFailure = deferred<"success" | "stale">();
		let loneRefreshes = 0;
		const loneCoordinator = createInboxRefreshCoordinator({
			currentGeneration: () => 1,
			isDisposed: () => false,
			refreshFirstPage: () => {
				loneRefreshes++;
				return loneFailure.promise;
			},
		});
		loneCoordinator.request(1);
		await flushPromises();
		loneFailure.reject(new Error("refresh failed"));
		await flushPromises();
		expect(loneRefreshes).toBe(1);
	});

	test("discards old generations and resumes current dirty work", async ({
		expect,
	}) => {
		let generation = 1;
		let disposed = false;
		const first = deferred<"success" | "stale">();
		const second = deferred<"success" | "stale">();
		const refreshes = [first, second];
		let refreshIndex = 0;
		const coordinator = createInboxRefreshCoordinator({
			currentGeneration: () => generation,
			isDisposed: () => disposed,
			refreshFirstPage: () => at(refreshes, refreshIndex++).promise,
		});

		coordinator.request(1);
		await flushPromises();
		generation = 2;
		coordinator.clear();
		coordinator.request(2);
		first.resolve("stale");
		await flushPromises();
		expect(refreshIndex).toBe(2);
		second.resolve("success");
		await flushPromises();

		disposed = true;
		coordinator.clear();
		coordinator.request(2);
		await flushPromises();
		expect(refreshIndex).toBe(2);
	});
});
