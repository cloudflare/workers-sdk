---
"@cloudflare/local-explorer-ui": minor
"miniflare": minor
---

Add email inspection and testing to Local Explorer

Add an Email group with Routing and Sending views for inspecting messages received by a Worker's `email()` handler and messages sent through its `send_email` bindings. Detail views show message content, metadata, attachments, and handler activity including forwarding, replies, rejection, and unhandled messages.

Add a test-email composer that delivers custom text, HTML, headers, and attachments directly to the selected Worker's `email()` handler during local development.
