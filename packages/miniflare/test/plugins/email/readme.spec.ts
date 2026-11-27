import { readFile } from "node:fs/promises";
import path from "node:path";
import { Miniflare } from "miniflare";
import dedent from "ts-dedent";
import { test } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";

// https://github.com/cloudflare/workers-sdk/issues/17110
// The Miniflare README lists Sending Email as "Not yet supported" in the
// `WorkerOptions` reference, although the email plugin simulates `send_email`
// bindings locally.

const README_PATH = path.resolve(__dirname, "../../../README.md");

const SEND_EMAIL_WORKER = dedent /* javascript */ `
	export default {
		async fetch(request, env) {
			return Response.json(await env.EMAIL.send({
				from: "sender@example.com",
				to: "recipient@example.net",
				subject: "Local simulation",
				text: "Control body",
			}));
		},
	};
`;

/**
 * Returns the `####` headings in the README section that starts at
 * `startHeading` and ends at `endHeading` whose body is `_Not yet supported_`.
 */
function getUnsupportedHeadings(
	readme: string,
	startHeading: string,
	endHeading: string
): string[] {
	const start = readme.indexOf(startHeading);
	const end = readme.indexOf(endHeading, start);
	if (start === -1 || end === -1) {
		throw new Error(
			`Could not find README section between "${startHeading}" and "${endHeading}"`
		);
	}
	const section = readme.slice(start, end);
	return Array.from(
		section.matchAll(/^#### (.+)\r?\n\r?\n_Not yet supported_/gm),
		(match) => match[1]
	);
}

test("send_email bindings are simulated locally by new Miniflare()", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					name: "email-test",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(SEND_EMAIL_WORKER),
					env: { EMAIL: { type: "send-email" } },
				},
			},
		],
	});
	useDispose(mf);

	const response = await mf.dispatchFetch("http://localhost/");
	expect(response.status).toBe(200);
	const result = (await response.json()) as { messageId?: unknown };
	expect(typeof result.messageId).toBe("string");
});

test("README WorkerOptions reference does not list Sending Email as unsupported", async ({
	expect,
}) => {
	const readme = await readFile(README_PATH, "utf8");
	const unsupported = getUnsupportedHeadings(
		readme,
		"### `interface WorkerOptions`",
		"### `interface SharedOptions`"
	);
	expect(
		unsupported.filter((heading) => heading.includes("Sending Email"))
	).toEqual([]);
});

test("README SharedOptions reference does not list Sending Email as unsupported", async ({
	expect,
}) => {
	const readme = await readFile(README_PATH, "utf8");
	const unsupported = getUnsupportedHeadings(
		readme,
		"### `interface SharedOptions`",
		"### `type MiniflareOptions`"
	);
	expect(
		unsupported.filter((heading) => heading.includes("Sending Email"))
	).toEqual([]);
});
