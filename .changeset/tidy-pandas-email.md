---
"wrangler": minor
---

Add support for dispatching email handlers with `createTestHarness`

You can now call `server.getWorker().email({ from, to, raw })` to dispatch directly to a Worker's `email()` handler and inspect its outcome, rejection reason, forwarded messages, and replies.

```ts
const result = await server.getWorker().email({
	from: "sender@example.com",
	to: "inbox@example.com",
	raw: [
		"From: Sender <sender@example.com>",
		"To: Inbox <inbox@example.com>",
		"Message-ID: <test@example.com>",
		"Subject: Test email",
		"",
		"Hello from the test harness",
	].join("\r\n"),
});

expect(result).toMatchObject({
	outcome: "ok",
	forwards: [{ rcptTo: "archive@example.com" }],
	replies: [{ raw: expect.stringContaining("Thanks for your email") }],
});
```
