import { readFile } from "node:fs/promises";
import test from "ava";
import { LogLevel, Miniflare } from "miniflare";
import dedent from "ts-dedent";
import { TestLog, waitFor } from "../../test-shared";

const SEND_EMAIL_WORKER = dedent/* javascript */ `
	import { EmailMessage } from "cloudflare:email";

	export default {
		async fetch(request, env, ctx) {

			const url = new URL(request.url);

			await env.SEND_EMAIL.send(new EmailMessage(
				url.searchParams.get("from"),
				url.searchParams.get("to"),
				request.body
			))

			return new Response("ok")
		},
	};
`;

const REPLY_EMAIL_WORKER = (email = "message.raw") => dedent/* javascript */ `
	import { EmailMessage } from "cloudflare:email";

	export default {
		fetch() {},
		async email(message) {
			const m = new EmailMessage(
				message.to,
				message.from,
				${email}
			);
			await message.reply(m);
		}
	};
`;

test("Unbound send_email binding works", async (t) => {
	const log = new TestLog(t);
	const mf = new Miniflare({
		log,
		modules: true,
		script: SEND_EMAIL_WORKER,
		email: {
			send_email: [{ name: "SEND_EMAIL" }],
		},
		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	t.is(await res.text(), "ok");
	t.is(res.status, 200);
	waitFor(async () =>
		t.true(
			log.logs.some(
				([type, message]) =>
					type === LogLevel.INFO &&
					message.includes(
						"send_email binding called with the following message:"
					)
			)
		)
	);

	const file = log.logs[1][1].split("\n")[1].trim();
	t.is(await readFile(file, "utf-8"), email);
});

test("Invalid email throws", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: SEND_EMAIL_WORKER,
		email: {
			send_email: [{ name: "SEND_EMAIL" }],
		},
		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: `adfsedfhwiofe`,
			method: "POST",
		}
	);

	t.true((await res.text()).startsWith("Error: invalid message-id"));
	t.is(res.status, 500);
});

test("Single allowed destination send_email binding works", async (t) => {
	const log = new TestLog(t);

	const mf = new Miniflare({
		log,
		modules: true,
		script: SEND_EMAIL_WORKER,
		email: {
			send_email: [
				{ name: "SEND_EMAIL", destination_address: "someone-else@example.com" },
			],
		},
		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.
	`;

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);

	t.is(await res.text(), "ok");
	t.is(res.status, 200);

	const bindingLog = await waitFor(async () => {
		const entry = log.logs.find(
			([type, message]) =>
				type === LogLevel.INFO &&
				message.match(/send_email binding called with the following message:\n/)
		);
		if (!entry) {
			throw new Error(
				"send_email binding log not found in " +
					JSON.stringify(log.logs, null, 2)
			);
		}
		return entry[/* message */ 1];
	});

	const file = bindingLog.split("\n")[1].trim();
	t.is(await readFile(file, "utf-8"), email);
});

test("Single allowed destination send_email binding throws if destination is not equal", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: SEND_EMAIL_WORKER,
		email: {
			send_email: [
				{ name: "SEND_EMAIL", destination_address: "helly.r@example.com" },
			],
		},
		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: `From: someone <someone@example.com>
To: someone else <someone-else@example.com>
Message-ID: <im-a-random-message-id@example.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);

	t.true(
		(await res.text()).startsWith(
			"Error: email to someone-else@example.com not allowed"
		)
	);
	t.is(res.status, 500);
});

test("Multiple allowed destination send_email binding works", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: SEND_EMAIL_WORKER,
		email: {
			send_email: [
				{
					name: "SEND_EMAIL",
					allowed_destination_addresses: [
						"milchick@example.com",
						"miss-huang@example.com",
					],
				},
			],
		},
		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "milchick@example.com",
			}).toString(),
		{
			body: `From: someone <someone@example.com>
To: someone else <milchick@example.com>
Message-ID: <im-a-random-message-id@example.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);

	t.is(await res.text(), "ok");
	t.is(res.status, 200);
});

test("Multiple allowed send_email binding throws if destination is not equal", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: SEND_EMAIL_WORKER,
		email: {
			send_email: [
				{
					name: "SEND_EMAIL",
					allowed_destination_addresses: [
						"milchick@example.com",
						"miss-huang@example.com",
					],
				},
			],
		},
		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "helly.r@example.com",
			}).toString(),
		{
			body: `From: someone <someone@example.com>
To: someone else <helly.r@example.com>
Message-ID: <im-a-random-message-id@example.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);

	t.true(
		(await res.text()).startsWith(
			"Error: email to helly.r@example.com not allowed"
		)
	);
	t.is(res.status, 500);
});

test("reply validation: x-auto-response-suppress", async (t) => {
	const log = new TestLog(t);
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		X-Auto-Response-Suppress: OOF
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	t.assert((await res.text()).includes("Original email is not replyable"));
});

test("reply validation: Auto-Submitted", async (t) => {
	const log = new TestLog(t);
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		Auto-Submitted: true
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	t.assert((await res.text()).includes("Original email is not replyable"));
});

test("reply validation: only In-Reply-To", async (t) => {
	const log = new TestLog(t);
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		In-Reply-To: <im-a-random-parent-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	t.assert((await res.text()).includes("Original email is not replyable"));
});

test("reply validation: only References", async (t) => {
	const log = new TestLog(t);
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		References: <im-a-random-parent-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	t.assert((await res.text()).includes("Original email is not replyable"));
});

test("reply validation: >100 References", async (t) => {
	const log = new TestLog(t);
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		In-Reply-To: <im-a-random-parent-message-id@example.com>
		References: <im-a-random-parent-message-id@example.com> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	t.assert((await res.text()).includes("Original email is not replyable"));
	t.is(log.logs[1][0], LogLevel.ERROR);
	t.is(
		log.logs[1][1].split("\n")[0],
		'The incoming email\'s "References" header has more than 100 entries. As such, your Worker cannot respond to this email. Refer to https://developers.cloudflare.com/email-routing/email-workers/reply-email-workers/.'
	);
});

test("reply: mismatched From: header", async (t) => {
	const log = new TestLog(t);
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);

	t.assert(
		(await res.text()).includes("From: header does not match mail from")
	);
});

test("reply: unparseable", async (t) => {
	const log = new TestLog(t);
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER('""'),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);

	t.assert((await res.text()).includes("could not parse email"));
});

test("reply: no message id", async (t) => {
	const log = new TestLog(t);
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(
			JSON.stringify(dedent`
				From: someone else <someone-else@example.com>
				To: someone <someone@example.com>
				MIME-Version: 1.0
				Content-Type: text/plain

				This is a random email body.`)
		),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);

	t.assert((await res.text()).includes("invalid message-id"));
});

test("reply: disallowed header", async (t) => {
	const log = new TestLog(t);
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(
			JSON.stringify(dedent`
				From: someone else <someone-else@example.com>
				To: someone <someone@example.com>
				MIME-Version: 1.0
				Content-Type: text/plain
				Message-ID: <im-a-random-message-id@example.com>
				Received: something

				This is a random email body.`)
		),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);

	t.assert((await res.text()).includes("invalid headers set"));
});

test("reply: missing In-Reply-To", async (t) => {
	const log = new TestLog(t);
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(
			JSON.stringify(dedent`
				From: someone else <someone-else@example.com>
				To: someone <someone@example.com>
				MIME-Version: 1.0
				Content-Type: text/plain
				Message-ID: <im-a-random-message-id@example.com>

				This is a random email body.`)
		),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);

	t.assert(
		(await res.text()).includes("no In-Reply-To header found in reply message")
	);
});

test("reply: wrong In-Reply-To", async (t) => {
	const log = new TestLog(t);
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(
			JSON.stringify(dedent`
				From: someone else <someone-else@example.com>
				To: someone <someone@example.com>
				MIME-Version: 1.0
				Content-Type: text/plain
				In-Reply-To: random
				Message-ID: <im-a-random-message-id@example.com>

				This is a random email body.`)
		),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);

	t.assert(
		(await res.text()).includes(
			"In-Reply-To does not match original Message-ID"
		)
	);
});

test("reply: invalid references", async (t) => {
	const log = new TestLog(t);
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(
			JSON.stringify(dedent`
				From: someone else <someone-else@example.com>
				To: someone <someone@example.com>
				MIME-Version: 1.0
				Content-Type: text/plain
				In-Reply-To: <im-a-random-parent-message-id@example.com>
				Message-ID: <im-a-random-message-id@example.com>
				References: <im-a-random-other-message-id@example.com>

				This is a random email body.`)
		),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-parent-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	t.assert(
		(await res.text()).includes("provided References header is invalid")
	);
});

test("reply: references generated correctly", async (t) => {
	const log = new TestLog(t);
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(
			JSON.stringify(dedent`
				From: someone else <someone-else@example.com>
				To: someone <someone@example.com>
				MIME-Version: 1.0
				Content-Type: text/plain
				In-Reply-To: <im-a-random-parent-message-id@example.com>
				Message-ID: <im-a-random-message-id@example.com>

				This is a random email body.`)
		),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-parent-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	t.is(await res.text(), "Worker successfully processed email");
	t.is(res.status, 200);
	t.is(log.logs[1][0], LogLevel.INFO);
	t.is(
		log.logs[1][1].split("\n")[0],
		"Email handler replied to sender with the following message:"
	);

	const file = log.logs[1][1].split("\n")[1].trim();
	t.assert(
		(await readFile(file, "utf-8")).includes(
			`References: <im-a-random-parent-message-id@example.com>`
		)
	);
});
