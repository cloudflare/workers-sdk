import crypto from "node:crypto";
import { resolve } from "node:path";
import { describe, it } from "vitest";
import {
	CLOUDFLARE_ACCOUNT_ID,
	E2E_ACCESS_WORKER_PREFIX,
	E2E_ACCOUNT_WORKERS_DEV_DOMAIN,
} from "../helpers/account-id";
import { WranglerE2ETestHelper } from "../helpers/e2e-wrangler-test";
import { waitForLong } from "../helpers/wait-for";

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID || !E2E_ACCESS_WORKER_PREFIX)(
	"wrangler dev - remote bindings behind Cloudflare Access",
	() => {
		// By default, anonymously probing a never-deployed worker behind a
		// wildcard Access application triggers a 404 instead of a 302 to
		// Access. Including an edge-preview token in the URL should make the
		// request correctly 302. We can't test the full authentication flow
		// here: service token credentials would authenticate but bypass the
		// Access probe altogether, so they wouldn't exercise this fix (and
		// interactive `cloudflared access login` can't work in CI), so we
		// instead at least test that wrangler correctly identifies Access.
		it("detects Access on an unpublished Worker's preview host", async ({
			expect,
		}) => {
			const workerName = `${E2E_ACCESS_WORKER_PREFIX}${crypto.randomUUID().slice(0, 8)}`;
			const helper = new WranglerE2ETestHelper();
			await helper.seed(resolve(__dirname, "./workers"));
			await helper.seed({
				"wrangler.json": JSON.stringify({
					name: workerName,
					main: "ai.js",
					compatibility_date: "2025-05-07",
					ai: { binding: "AI", remote: true },
				}),
			});

			// Precondition: without the preview token, the host isn't recognisably
			// behind Access. If this returns a 302, the test no longer reproduces
			// the bug (e.g. the Access app changed or the Worker was deployed).
			const anonymous = await fetch(
				`https://${workerName}.${E2E_ACCOUNT_WORKERS_DEV_DOMAIN}/`,
				{ redirect: "manual" }
			);
			expect(anonymous.status).toBe(404);

			// Remove any service-token credentials so Wrangler has to probe for
			// Access. The e2e process is non-interactive, so detecting Access
			// produces an actionable error instead of starting `cloudflared`.
			const worker = helper.runLongLived("wrangler dev", {
				env: {
					...process.env,
					CLOUDFLARE_ACCESS_CLIENT_ID: undefined,
					CLOUDFLARE_ACCESS_CLIENT_SECRET: undefined,
				},
			});

			await waitForLong(
				() =>
					expect(worker.currentOutput).toContain(`The domain "${workerName}.`),
				{ timeout: 60_000 }
			);
			expect(worker.currentOutput).toContain(
				"is behind Cloudflare Access, but no Access Service Token credentials were found"
			);
		});
	}
);
