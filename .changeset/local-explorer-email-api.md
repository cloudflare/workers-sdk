---
"miniflare": minor
---

Capture locally sent and received emails, along with forwarding and reply activity and metadata, for inspection through the Local Explorer email API.

Miniflare now captures locally sent and received emails, including forwarding, reply, rejection, and exception activity. The following endpoints are available below `/cdn-cgi/local/explorer/api` while `wrangler dev` is running:

- `POST /local/email/routing/send?worker=<name>` sends a test email to a Worker's `email()` handler.
- `GET /local/email/routing?worker=<name>` lists emails received by a Worker.
- `GET /local/email/routing?email_id=<message-id>&worker=<name>` returns a received email and its handler activity.
- `GET /local/email/sending?worker=<name>` lists emails sent through a Worker's `send_email` bindings.
- `GET /local/email/sending?email_id=<message-id>&worker=<name>` returns a sent email.

For example, send and then inspect a test email against a Worker named `my-worker`:

```sh
curl -X POST \
  "http://localhost:8787/cdn-cgi/local/explorer/api/local/email/routing/send?worker=my-worker" \
  -H "Content-Type: application/json" \
  --data '{
    "from": "sender@example.com",
    "to": ["inbox@example.com"],
    "subject": "Local test",
    "text": "Hello from Local Explorer"
  }'

curl \
  "http://localhost:8787/cdn-cgi/local/explorer/api/local/email/routing?worker=my-worker"
```

List endpoints support `per_page` and opaque `cursor` query parameters. File paths logged by the `send_email` binding are asynchronous debugging artifacts and should not be used to synchronize after `send()` resolves. Email handler exceptions are logged when structured local delivery reports an exception outcome.

When email content exceeds the local storage row budget of approximately 2 MB, the email is delivered in full but the Local Explorer capture is truncated to fit. Detail responses identify each truncated sent email, received email, or reply in the top-level `messages` array with warning code `10604`; for example:

```json
{
	"messages": [
		{
			"code": 10604,
			"message": "Displayed received email content was truncated during local capture. The complete message was still delivered to the Worker."
		}
	]
}
```
