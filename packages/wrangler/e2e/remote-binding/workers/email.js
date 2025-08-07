import { EmailMessage } from "cloudflare:email";

export default {
	async fetch(request, env) {
		const m = new EmailMessage(
			"sender@example.com",
			"someone@example.com",
			`Date: Thu, 07 Aug 2025 16:25:50 +0000
From: =?utf-8?B?R1BULTQ=?= <sender@example.com>
To: <someone@example.com>
Message-ID: <hxut3hoagu@penalosa.cloud>
Subject: =?utf-8?B?QW4gZW1haWwgZ2VuZXJhdGVkIGluIGEgV29ya2Vy?=
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 7bit

Congratulations, you just sent an email from a Worker.`
		);
		await env.EMAIL.send(m);

		return new Response("Sent!");
	},
};
