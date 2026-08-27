import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import {
	EmailHandlerOutcomeWarning,
	hasEmailHandlerException,
} from "../../components/email/EmailHandlerOutcomeWarning";

test("identifies handler exceptions without treating missing handlers as throws", ({
	expect,
}) => {
	expect(
		hasEmailHandlerException({
			events: [{ timestamp: "2026-08-27T00:00:00.000Z", type: "received" }],
			outcome: "exception",
		})
	).toBe(true);
	expect(
		hasEmailHandlerException({
			events: [{ timestamp: "2026-08-27T00:00:00.000Z", type: "unhandled" }],
			outcome: "exception",
		})
	).toBe(false);
	expect(
		hasEmailHandlerException({
			events: [{ timestamp: "2026-08-27T00:00:00.000Z", type: "received" }],
			outcome: "ok",
		})
	).toBe(false);
});

test("renders a message-level handler exception alert", ({ expect }) => {
	const markup = renderToStaticMarkup(EmailHandlerOutcomeWarning());
	expect(markup).toContain('role="alert"');
	expect(markup).toContain("handler threw an exception");
});
