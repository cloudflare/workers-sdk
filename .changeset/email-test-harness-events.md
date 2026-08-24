---
"miniflare": minor
"wrangler": minor
---

Include a chronological list of handler events in email test harness results, so programmatic local email tests can assert the order in which messages are received, forwarded, replied to, or rejected.

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

expect(result.events).toEqual([
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
]);
```
