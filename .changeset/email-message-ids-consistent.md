---
"miniflare": patch
---

Generate email message ids in a single, production-shaped format

Message ids were synthesized differently at each point one was needed, so the ids a Worker saw locally did not match what production returns and did not agree with each other. Replying to a message returned an id with no enclosing angle brackets, always using `example.com` rather than the sender's domain, and forwarding returned an id far shorter than production's.

All message ids are now produced by one helper in the format the production `send_email` binding returns — `<{36 alphanumeric characters}@{domain}>` — taken from the relevant sender or recipient domain. Emails sent from the local explorer are keyed off their `Message-ID` in the same way the `send_email` binding is, so the id shown in the explorer, the header in the raw MIME, and the name of the file written to disk all agree. A `Message-ID` supplied explicitly through the explorer's custom headers is honoured instead of being overwritten, and is no longer emitted twice in the message.
