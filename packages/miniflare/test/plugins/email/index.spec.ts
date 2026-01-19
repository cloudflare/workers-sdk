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

const MESSAGE_BUILDER_WORKER = dedent/* javascript */ `
	export default {
		async fetch(request, env) {
			const builder = await request.json();
			await env.SEND_EMAIL.send(builder);
			return new Response("ok");
		},
	};
`;

test("MessageBuilder with text only", async () => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		modules: true,
		script: MESSAGE_BUILDER_WORKER,
		email: {
			send_email: [{ name: "SEND_EMAIL" }],
		},
		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test Email",
			text: "Hello, this is a test email!",
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	await vi.waitFor(
		async () => {
			const entry = log.logs.find(
				([type, message]) =>
					type === LogLevel.INFO &&
					message.includes("send_email binding called with MessageBuilder:")
			);
			if (!entry) {
				throw new Error(
					"send_email binding log not found in " +
						JSON.stringify(log.logs, null, 2)
				);
			}
			const message = entry[1];

			// Verify the formatted message contains expected fields
			expect(message).toContain("From: sender@example.com");
			expect(message).toContain("To: recipient@example.com");
			expect(message).toContain("Subject: Test Email");
			expect(message).toContain("Text: ");
		},
		{ timeout: 5_000, interval: 100 }
	);
});

test("MessageBuilder with HTML only", async () => {
	const mf = new Miniflare({
		modules: true,
		script: MESSAGE_BUILDER_WORKER,
		email: {
			send_email: [{ name: "SEND_EMAIL" }],
		},
		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "HTML Test",
			html: "<h1>Hello World</h1>",
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);
});

test("MessageBuilder with both text and HTML", async () => {
	const mf = new Miniflare({
		modules: true,
		script: MESSAGE_BUILDER_WORKER,
		email: {
			send_email: [{ name: "SEND_EMAIL" }],
		},
		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Multipart Test",
			text: "Plain text",
			html: "<p>HTML</p>",
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);
});

test("MessageBuilder with attachments", async () => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		modules: true,
		script: MESSAGE_BUILDER_WORKER,
		email: {
			send_email: [{ name: "SEND_EMAIL" }],
		},
		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Attachment Test",
			text: "See attachment",
			attachments: [
				{
					disposition: "attachment",
					filename: "test.txt",
					type: "text/plain",
					content: "base64content",
				},
			],
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	await vi.waitFor(
		async () => {
			const entry = log.logs.find(
				([type, message]) =>
					type === LogLevel.INFO &&
					message.includes("send_email binding called with MessageBuilder:")
			);
			if (!entry) {
				throw new Error("send_email binding log not found");
			}
			const message = entry[1];

			// Verify attachment file path is logged
			expect(message).toContain("Attachment (attachment): test.txt ->");
		},
		{ timeout: 5_000, interval: 100 }
	);
});

test("MessageBuilder log output format snapshot", async () => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		modules: true,
		script: MESSAGE_BUILDER_WORKER,
		email: {
			send_email: [{ name: "SEND_EMAIL" }],
		},
		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: { name: "Alice Sender", email: "alice@example.com" },
			to: ["bob@example.com", "charlie@example.com"],
			cc: "team@example.com",
			bcc: "boss@example.com",
			subject: "Quarterly Report",
			text: "Please see the attached quarterly report.",
			html: "<h1>Quarterly Report</h1><p>Please see the attached report.</p>",
			attachments: [
				{
					disposition: "inline",
					contentId: "logo123",
					filename: "logo.png",
					type: "image/png",
					content: "iVBORw0KGgo=",
				},
				{
					disposition: "attachment",
					filename: "report.pdf",
					type: "application/pdf",
					content: "JVBERi0xLjc=",
				},
			],
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	await vi.waitFor(
		async () => {
			const entry = log.logs.find(
				([type, message]) =>
					type === LogLevel.INFO &&
					message.includes("send_email binding called with MessageBuilder:")
			);
			if (!entry) {
				throw new Error("send_email binding log not found");
			}
			const message = entry[1];

			// Strip ANSI color codes and normalize file paths for snapshot
			const cleanMessage = message
				.replace(/\x1b\[[0-9;]*m/g, "")
				// Replace dynamic file paths with placeholders (Unix and Windows)
				.replace(
					/(?:[A-Z]:\\|\/)[^\s]*[/\\](email-text|email-html|email-attachment)[/\\][a-f0-9-]+\.(txt|html|png|pdf)/g,
					"/$1/[FILE].$2"
				);

			// Snapshot the entire formatted output
			expect(cleanMessage).toMatchInlineSnapshot(`
				"send_email binding called with MessageBuilder:
				From: "Alice Sender" <alice@example.com>
				To: bob@example.com, charlie@example.com
				Cc: team@example.com
				Bcc: boss@example.com
				Subject: Quarterly Report

				Text: /email-text/[FILE].txt
				HTML: /email-html/[FILE].html
				Attachment (inline): logo.png -> /email-attachment/[FILE].png
				Attachment (attachment): report.pdf -> /email-attachment/[FILE].pdf"
			`);
		},
		{ timeout: 5_000, interval: 100 }
	);
});

test("MessageBuilder with inline attachment", async () => {
	const mf = new Miniflare({
		modules: true,
		script: MESSAGE_BUILDER_WORKER,
		email: {
			send_email: [{ name: "SEND_EMAIL" }],
		},
		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Inline Test",
			html: '<img src="cid:logo" />',
			attachments: [
				{
					disposition: "inline",
					contentId: "logo",
					filename: "logo.png",
					type: "image/png",
					content: "base64imagedata",
				},
			],
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);
});

test("MessageBuilder with EmailAddress objects", async () => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		modules: true,
		script: MESSAGE_BUILDER_WORKER,
		email: {
			send_email: [{ name: "SEND_EMAIL" }],
		},
		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: { name: "John Doe", email: "john@example.com" },
			to: { name: "Jane Smith", email: "jane@example.com" },
			subject: "Named Address Test",
			text: "Hello",
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	await vi.waitFor(
		async () => {
			const entry = log.logs.find(
				([type, message]) =>
					type === LogLevel.INFO &&
					message.includes("send_email binding called with MessageBuilder:")
			);
			if (!entry) {
				throw new Error("send_email binding log not found");
			}
			const message = entry[1];

			// Verify named addresses are formatted correctly
			expect(message).toContain('"John Doe" <john@example.com>');
			expect(message).toContain('"Jane Smith" <jane@example.com>');
			expect(message).toContain("Subject: Named Address Test");
		},
		{ timeout: 5_000, interval: 100 }
	);
});

test("MessageBuilder with multiple recipients", async () => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		modules: true,
		script: MESSAGE_BUILDER_WORKER,
		email: {
			send_email: [{ name: "SEND_EMAIL" }],
		},
		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: ["recipient1@example.com", "recipient2@example.com"],
			cc: "cc@example.com",
			bcc: ["bcc1@example.com", "bcc2@example.com"],
			subject: "Multiple Recipients",
			text: "Hello all",
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	await vi.waitFor(
		async () => {
			const entry = log.logs.find(
				([type, message]) =>
					type === LogLevel.INFO &&
					message.includes("send_email binding called with MessageBuilder:")
			);
			if (!entry) {
				throw new Error("send_email binding log not found");
			}
			const message = entry[1];

			// Verify multiple recipients are listed
			expect(message).toContain(
				"To: recipient1@example.com, recipient2@example.com"
			);
			expect(message).toContain("Cc: cc@example.com");
			expect(message).toContain("Bcc: bcc1@example.com, bcc2@example.com");
		},
		{ timeout: 5_000, interval: 100 }
	);
});

test("MessageBuilder with custom headers", async () => {
	const mf = new Miniflare({
		modules: true,
		script: MESSAGE_BUILDER_WORKER,
		email: {
			send_email: [{ name: "SEND_EMAIL" }],
		},
		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Custom Headers",
			text: "Test",
			headers: {
				"X-Custom": "value",
			},
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);
});

test("MessageBuilder respects allowed_destination_addresses", async () => {
	const mf = new Miniflare({
		modules: true,
		script: MESSAGE_BUILDER_WORKER,
		email: {
			send_email: [
				{
					name: "SEND_EMAIL",
					allowed_destination_addresses: ["allowed@example.com"],
				},
			],
		},
		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: "notallowed@example.com",
			subject: "Test",
			text: "Test",
		}),
	});

	expect(res.status).toBe(500);
	const error = await res.text();
	expect(error).toContain("not allowed");
});

test("MessageBuilder respects allowed_sender_addresses", async () => {
	const mf = new Miniflare({
		modules: true,
		script: MESSAGE_BUILDER_WORKER,
		email: {
			send_email: [
				{
					name: "SEND_EMAIL",
					allowed_sender_addresses: ["allowed@example.com"],
				},
			],
		},
		compatibilityDate: "2025-03-17",
	});

	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "notallowed@example.com",
			to: "recipient@example.com",
			subject: "Test",
			text: "Test",
		}),
	});

	expect(res.status).toBe(500);
	const error = await res.text();
	expect(error).toContain("not allowed");
});

test("MessageBuilder backward compatibility - old EmailMessage API still works", async () => {
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
		Message-ID: <backward-compat-test@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This tests backward compatibility.`;

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
});
