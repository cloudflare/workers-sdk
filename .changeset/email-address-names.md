---
"miniflare": minor
---

Support named recipients in the Email Sending API MessageBuilder

The `send_email` binding's MessageBuilder now accepts `EmailAddress` objects for `to`, `cc`, and `bcc` in addition to plain strings. You can mix named and plain addresses in the same array:

```js
await env.SEND_EMAIL.send({
	from: "sender@example.com",
	to: [
		"plain@example.com",
		'"Name" <address@example.com>',
		{ name: "Jane Doe", email: "jane@example.com" },
	],
	cc: [{ name: "CC Person", email: "cc@example.com" }],
	subject: "Hello",
	text: "...",
});
```

Additionally, addresses in `"Name" <address>` format are now correctly parsed when checking `allowed_destination_addresses` and `allowed_sender_addresses` restrictions.
