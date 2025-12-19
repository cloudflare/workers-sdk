import { readFile } from "node:fs/promises";
import { LogLevel, Miniflare } from "miniflare";
import dedent from "ts-dedent";
import { expect, test, vi } from "vitest";
import { TestLog, useDispose } from "../../test-shared";

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

test("Unbound send_email binding works", async () => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		modules: true,
		script: SEND_EMAIL_WORKER,
		email: {
			send_email: [{ name: "SEND_EMAIL" }],
		},
		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

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
	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);
	await vi.waitFor(
		async () => {
			const entry = log.logs.find(
				([type, message]) =>
					type === LogLevel.INFO &&
					message.match(
						/send_email binding called with the following message:\n/
					)
			);
			if (!entry) {
				throw new Error(
					"send_email binding log not found in " +
						JSON.stringify(log.logs, null, 2)
				);
			}
			const file = entry[/* message */ 1].split("\n")[1].trim();
			expect(await readFile(file, "utf-8")).toBe(email);
		},
		{ timeout: 5_000, interval: 100 }
	);
});

test("Invalid email throws", async () => {
	const mf = new Miniflare({
		modules: true,
		script: SEND_EMAIL_WORKER,
		email: {
			send_email: [{ name: "SEND_EMAIL" }],
		},
		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

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

	expect((await res.text()).startsWith("Error: invalid message-id"));
	expect(res.status).toBe(500);
});

test("Single allowed destination send_email binding works", async () => {
	const log = new TestLog();

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

	useDispose(mf);

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

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	await vi.waitFor(
		async () => {
			const entry = log.logs.find(
				([type, message]) =>
					type === LogLevel.INFO &&
					message.match(
						/send_email binding called with the following message:\n/
					)
			);
			if (!entry) {
				throw new Error(
					"send_email binding log not found in " +
						JSON.stringify(log.logs, null, 2)
				);
			}
			const file = entry[/* message */ 1].split("\n")[1].trim();
			expect(await readFile(file, "utf-8")).toBe(email);
		},
		{ timeout: 5_000, interval: 100 }
	);
});

test("Single allowed destination send_email binding throws if destination is not equal", async () => {
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

	useDispose(mf);

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

	expect(
		(await res.text()).startsWith(
			"Error: email to someone-else@example.com not allowed"
		)
	);
	expect(res.status).toBe(500);
});

test("Multiple allowed destination send_email binding works", async () => {
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

	useDispose(mf);

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

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);
});

test("Multiple allowed senders send_email binding works", async () => {
	const mf = new Miniflare({
		modules: true,
		script: SEND_EMAIL_WORKER,
		email: {
			send_email: [
				{
					name: "SEND_EMAIL",
					allowed_sender_addresses: [
						"milchick@example.com",
						"miss-huang@example.com",
					],
				},
			],
		},
		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				to: "someone@example.com",
				from: "milchick@example.com",
			}).toString(),
		{
			body: `To: someone <someone@example.com>
From: someone else <milchick@example.com>
Message-ID: <im-a-random-message-id@example.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);
});

test("Sending email from a sender not in the allowed list does not work", async () => {
	const mf = new Miniflare({
		modules: true,
		script: SEND_EMAIL_WORKER,
		email: {
			send_email: [
				{
					name: "SEND_EMAIL",
					allowed_sender_addresses: [
						"milchick@example.com",
						"miss-huang@example.com",
					],
				},
			],
		},
		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				to: "someone@example.com",
				from: "notallowed@example.com",
			}).toString(),
		{
			body: `To: someone <someone@example.com>
From: someone else <milchick@example.com>
Message-ID: <im-a-random-message-id@example.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);

	expect(
		(await res.text()).startsWith(
			"Error: email from notallowed@example.com not allowed"
		)
	);
	expect(res.status).toBe(500);
});

test("Multiple allowed send_email binding throws if destination is not equal", async () => {
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

	useDispose(mf);

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

	expect(
		(await res.text()).startsWith(
			"Error: email to helly.r@example.com not allowed"
		)
	);
	expect(res.status).toBe(500);
});

test("reply validation: x-auto-response-suppress", async () => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

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
	expect((await res.text()).includes("Original email is not replyable"));
});

test("reply validation: Auto-Submitted", async () => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

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
	expect((await res.text()).includes("Original email is not replyable"));
});

test("reply validation: only In-Reply-To", async () => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

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
	expect((await res.text()).includes("Original email is not replyable"));
});

test("reply validation: only References", async () => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

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
	expect((await res.text()).includes("Original email is not replyable"));
});

test("reply validation: >100 References", async () => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

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
	expect((await res.text()).includes("Original email is not replyable"));
	expect(log.logs[1][0]).toBe(LogLevel.ERROR);
	expect(log.logs[1][1].split("\n")[0]).toBe(
		'The incoming email\'s "References" header has more than 100 entries. As such, your Worker cannot respond to this email. Refer to https://developers.cloudflare.com/email-routing/email-workers/reply-email-workers/.'
	);
});

test("reply: mismatched From: header", async () => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER(),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

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

	expect((await res.text()).includes("From: header does not match mail from"));
});

test("reply: unparseable", async () => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		modules: true,
		script: REPLY_EMAIL_WORKER('""'),
		unsafeTriggerHandlers: true,

		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

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

	expect((await res.text()).includes("could not parse email"));
});

test("reply: no message id", async () => {
	const log = new TestLog();
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

	useDispose(mf);

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

	expect((await res.text()).includes("invalid message-id"));
});

test("reply: disallowed header", async () => {
	const log = new TestLog();
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

	useDispose(mf);

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

	expect((await res.text()).includes("invalid headers set"));
});

test("reply: missing In-Reply-To", async () => {
	const log = new TestLog();
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

	useDispose(mf);

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

	expect(
		(await res.text()).includes("no In-Reply-To header found in reply message")
	);
});

test("reply: wrong In-Reply-To", async () => {
	const log = new TestLog();
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

	useDispose(mf);

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

	expect(
		(await res.text()).includes(
			"In-Reply-To does not match original Message-ID"
		)
	);
});

test("reply: invalid references", async () => {
	const log = new TestLog();
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

	useDispose(mf);

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
	expect((await res.text()).includes("provided References header is invalid"));
});

test("reply: references generated correctly", async () => {
	const log = new TestLog();
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

	useDispose(mf);

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
	expect(await res.text()).toBe("Worker successfully processed email");
	expect(res.status).toBe(200);
	expect(log.logs[1][0]).toBe(LogLevel.INFO);
	expect(log.logs[1][1].split("\n")[0]).toBe(
		"Email handler replied to sender with the following message:"
	);

	const file = log.logs[1][1].split("\n")[1].trim();
	const fileContent = await readFile(file, "utf-8");
	expect(fileContent).toBeTruthy();
	expect(
		fileContent.includes(
			`References: <im-a-random-parent-message-id@example.com>`
		)
	).toBe(true);
});
