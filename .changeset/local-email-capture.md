---
"miniflare": minor
"wrangler": minor
---

Capture locally sent and received emails so you can inspect them during development. Emails stored in the user's project directory (or system temporary directory) are now stored using their message ID rather than a UUID.

The email test harness result now includes a chronological list of handler events, so programmatic local email tests can assert on the order in which events occurred.

Note that the file path logged by the `send_email` binding (the `send_email binding called with ...` log line) is now written asynchronously, so it may not exist immediately after `send()` resolves. When reading the logged file path immediately after awaiting `send()`, do not assume the file exists yet.

Sending, replying to, or receiving an email larger than the 1 MiB local capture limit no longer fails: the email is delivered in full and a copy truncated to the first 1 MiB is captured for the Local Explorer (a warning is logged when truncation occurs).

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

expect(result).toEqual({
	outcome: "ok",
	forwards: [
		{
			messageId: expect.any(String),
			recipient: "archive@example.com",
			headers: [],
		},
	],
	replies: [
		{
			messageId: expect.any(String),
			sender: "reply@example.com",
			raw: expect.stringContaining("Thanks for your email"),
		},
	],
	events: [
		{ type: "received", timestamp: expect.any(String) },
		{
			type: "forward",
			timestamp: expect.any(String),
			messageId: expect.any(String),
		},
		{
			type: "reply",
			timestamp: expect.any(String),
			messageId: expect.any(String),
		},
	],
});
```
