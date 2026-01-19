---
"miniflare": minor
---

Add support for Email Sending API's MessageBuilder interface in local mode

Miniflare now supports the simplified MessageBuilder interface for sending emails, alongside the existing `EmailMessage` support.

Example usage:

```javascript
await env.EMAIL.send({
	from: { name: "Alice", email: "alice@example.com" },
	to: ["bob@example.com"],
	subject: "Hello",
	text: "Plain text version",
	html: "<h1>HTML version</h1>",
	attachments: [
		{
			disposition: "attachment",
			filename: "report.pdf",
			type: "application/pdf",
			content: pdfData,
		},
	],
});
```

In local mode, email content (text, HTML, attachments) is stored to temporary files that you can open in your editor or browser for inspection. File paths are logged to the console when emails are sent.
