---
"miniflare": patch
---

Generate and use production-style Message-IDs for local email artifacts

Locally sent emails and replies now use generated Message-IDs - which are 36 alphanumeric characters - consistently in returned results, raw MIME headers, Local Explorer records, and stored artifact filenames. User-provided `Message-ID` headers are replaced by the generated ID.

For example, sending an email from `sender@example.com` may return `<AbCdEfGhIjKlMnOpQrStUvWxYz0123456789@example.com>`. The raw email uses that same value for its `Message-ID` header, the Local Explorer exposes the same ID, and the stored artifact is named `AbCdEfGhIjKlMnOpQrStUvWxYz0123456789@example.com.eml`.

Similarly, a reply containing `Message-ID: <custom@example.com>` is stored and returned with a newly generated ID instead. This mirrors production behavior and prevents the supplied ID from becoming the local artifact key.
