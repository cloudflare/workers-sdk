import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import {
	EmailTruncationWarning,
	hasEmailTruncationWarning,
} from "../../components/email/EmailTruncationWarning";

test("identifies truncation using the warning message for its context", ({
	expect,
}) => {
	const receivedWarning = [
		{
			code: 10604,
			message:
				"Displayed received email content was truncated during local capture. The complete message was still delivered to the Worker.",
		},
	];
	const replyWarning = [
		{
			code: 10604,
			message:
				"Displayed reply content was truncated during local capture. The complete reply is available in the local filesystem; see the development log for its path.",
		},
	];
	const sentWarning = [
		{
			code: 10604,
			message:
				"Displayed sent email content was truncated during local capture. The complete email is available in the local filesystem; see the development log for its path.",
		},
	];

	expect(hasEmailTruncationWarning(receivedWarning, "received")).toBe(true);
	expect(hasEmailTruncationWarning(receivedWarning, "reply")).toBe(false);
	expect(hasEmailTruncationWarning(receivedWarning, "sent")).toBe(false);
	expect(hasEmailTruncationWarning(replyWarning, "received")).toBe(false);
	expect(hasEmailTruncationWarning(replyWarning, "reply")).toBe(true);
	expect(hasEmailTruncationWarning(replyWarning, "sent")).toBe(false);
	expect(hasEmailTruncationWarning(sentWarning, "received")).toBe(false);
	expect(hasEmailTruncationWarning(sentWarning, "reply")).toBe(false);
	expect(hasEmailTruncationWarning(sentWarning, "sent")).toBe(true);
});

test("renders a reply-specific truncation warning", ({ expect }) => {
	const markup = renderToStaticMarkup(
		EmailTruncationWarning({ kind: "reply" })
	);
	expect(markup).toContain("Reply content was truncated");
	expect(markup).toContain("temporary local storage");
});
