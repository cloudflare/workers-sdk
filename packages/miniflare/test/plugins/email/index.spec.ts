import test from "ava";
import { Miniflare } from "miniflare";

const SEND_EMAIL_SCRIPT = () => `
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
};`;

test("Unbound send_email binding works", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: SEND_EMAIL_SCRIPT(),
		email: {
			send_email: [{ name: "SEND_EMAIL" }],
		},
		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@exmaple.com",
				to: "someone-else@exmaple.com",
			}).toString(),
		{
			body: `From: someone <someone@exmaple.com>
To: someone else <someone-else@exmaple.com>
Message-ID: <im-a-random-message-id@exmaple.com>
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

test("Invalid email throws", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: SEND_EMAIL_SCRIPT(),
		email: {
			send_email: [{ name: "SEND_EMAIL" }],
		},
		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@exmaple.com",
				to: "someone-else@exmaple.com",
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
	const mf = new Miniflare({
		modules: true,
		script: SEND_EMAIL_SCRIPT(),
		email: {
			send_email: [
				{ name: "SEND_EMAIL", destination_address: "someone-else@exmaple.com" },
			],
		},
		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@exmaple.com",
				to: "someone-else@exmaple.com",
			}).toString(),
		{
			body: `From: someone <someone@exmaple.com>
To: someone else <someone-else@exmaple.com>
Message-ID: <im-a-random-message-id@exmaple.com>
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

test("Single allowed destination send_email binding throws if destiantion is not equal", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: SEND_EMAIL_SCRIPT(),
		email: {
			send_email: [
				{ name: "SEND_EMAIL", destination_address: "helly.r@exmaple.com" },
			],
		},
		compatibilityDate: "2025-03-17",
	});

	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@exmaple.com",
				to: "someone-else@exmaple.com",
			}).toString(),
		{
			body: `From: someone <someone@exmaple.com>
To: someone else <someone-else@exmaple.com>
Message-ID: <im-a-random-message-id@exmaple.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);

	t.true(
		(await res.text()).startsWith(
			"Error: email to someone-else@exmaple.com not allowed"
		)
	);
	t.is(res.status, 500);
});

test("Multiple allowed destination send_email binding works", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: SEND_EMAIL_SCRIPT(),
		email: {
			send_email: [
				{
					name: "SEND_EMAIL",
					allowed_destination_addresses: [
						"milchick@exmaple.com",
						"miss-huang@exmaple.com",
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
				from: "someone@exmaple.com",
				to: "milchick@exmaple.com",
			}).toString(),
		{
			body: `From: someone <someone@exmaple.com>
To: someone else <milchick@exmaple.com>
Message-ID: <im-a-random-message-id@exmaple.com>
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

test("Multiple allowed send_email binding throws if destiantion is not equal", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: SEND_EMAIL_SCRIPT(),
		email: {
			send_email: [
				{
					name: "SEND_EMAIL",
					allowed_destination_addresses: [
						"milchick@exmaple.com",
						"miss-huang@exmaple.com",
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
				from: "someone@exmaple.com",
				to: "helly.r@exmaple.com",
			}).toString(),
		{
			body: `From: someone <someone@exmaple.com>
To: someone else <helly.r@exmaple.com>
Message-ID: <im-a-random-message-id@exmaple.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);

	t.true(
		(await res.text()).startsWith(
			"Error: email to helly.r@exmaple.com not allowed"
		)
	);
	t.is(res.status, 500);
});
