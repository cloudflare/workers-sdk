import { describe, test } from "vitest";
import { getWorkerChangeDestination } from "../../utils/worker-navigation";

describe("getWorkerChangeDestination", () => {
	test("redirects an email routing detail path to its parent list", ({
		expect,
	}) => {
		expect(getWorkerChangeDestination("/email/routing/some-email-id")).toBe(
			"/email/routing"
		);
	});

	test("redirects an email sending detail path to its parent list", ({
		expect,
	}) => {
		expect(getWorkerChangeDestination("/email/sending/some-email-id")).toBe(
			"/email/sending"
		);
	});

	test("preserves the router basepath when redirecting", ({ expect }) => {
		expect(
			getWorkerChangeDestination(
				"/cdn-cgi/local/explorer/email/routing/some-email-id"
			)
		).toBe("/cdn-cgi/local/explorer/email/routing");
	});

	test("leaves the parent list pages unchanged", ({ expect }) => {
		expect(getWorkerChangeDestination("/email/routing")).toBe("/email/routing");
		expect(getWorkerChangeDestination("/email/sending")).toBe("/email/sending");
	});

	test("leaves the routing index (trailing slash) unchanged", ({ expect }) => {
		// The list view lives at "/email/routing/"; only actual detail segments
		// (a non-empty id after the slash) should trigger a redirect.
		expect(getWorkerChangeDestination("/email/routing/")).toBe(
			"/email/routing/"
		);
	});

	test("leaves unrelated paths unchanged", ({ expect }) => {
		expect(getWorkerChangeDestination("/kv/my-namespace")).toBe(
			"/kv/my-namespace"
		);
		expect(getWorkerChangeDestination("/cdn-cgi/local/explorer/")).toBe(
			"/cdn-cgi/local/explorer/"
		);
	});
});
