# Email Worker Fixture

This fixture demonstrates both the **EmailMessage API** (raw MIME) and the **MessageBuilder API** for sending emails in Cloudflare Workers.

## Running Locally

Start the development server:

```bash
pnpm start
# or
wrangler dev
```

## Available Routes

### EmailMessage API (Raw MIME)

**`GET /send`** - Original API using manual MIME construction

- Uses the `mimetext` library to build MIME messages
- Sends via `LIST_SEND` binding

### MessageBuilder API

**`GET /send-simple`** - Simple text-only email

- Basic MessageBuilder example with plain text
- Demonstrates named sender: `{ name: "Alice", email: "..." }`

**`GET /send-html`** - Email with text and HTML versions

- Shows how to include both `text` and `html` content
- HTML includes inline CSS styling

**`GET /send-attachment`** - Email with single text attachment

- Demonstrates attaching a text file
- Uses `TextEncoder` to create content

**`GET /send-multi-attachment`** - Email with multiple attachments

- Includes three different attachment types:
  - Text file (`.txt`)
  - JSON file (`.json`)
  - Binary file (simulated `.pdf`)
- Shows both text and HTML content

**`GET /send-complex`** - Complex email with multiple recipients

- Multiple TO recipients (with and without names)
- CC recipient with name
- BCC recipient (array)
- Both text and HTML content

### Testing Bindings

**`GET /test-bindings`** - Test all three email binding types

- `UNBOUND_SEND` - No restrictions on recipients
- `SPECIFIC_SEND` - Only allows `something@example.com`
- `LIST_SEND` - Allows `something@example.com` and `else@example.com`

## What to Expect

When you send emails using these routes:

1. **Console Output**: Miniflare logs details about the email being sent
2. **File Paths**: For MessageBuilder emails, you'll see temp file paths:
   - Text content → `.txt` files
   - HTML content → `.html` files
   - Attachments → Files with their original extensions

### Example Console Output

```
send_email binding called with MessageBuilder:
From: "Alice" <sender@penalosa.cloud>
To: else@example.com
Subject: Simple MessageBuilder Test

Text: /var/folders/.../email-text/abc-123.txt
```

You can open these files in your editor or browser to inspect the email content.

## Email Bindings Configuration

This fixture has three email bindings configured in `wrangler.jsonc`:

```jsonc
{
	"send_email": [
		{
			"name": "UNBOUND_SEND",
			// No restrictions
		},
		{
			"name": "SPECIFIC_SEND",
			"destination_address": "something@example.com",
			// Only allows sending to this specific address
		},
		{
			"name": "LIST_SEND",
			"allowed_destination_addresses": [
				"something@example.com",
				"else@example.com",
			],
			// Only allows sending to addresses in this list
		},
	],
}
```

## Notes

- Type assertions (`as any`) are used because `@cloudflare/workers-types` doesn't yet include MessageBuilder types
- At runtime in Miniflare, the MessageBuilder API works correctly
- The `allowed_sender_addresses` configuration is not included in this fixture, so any sender address is accepted
