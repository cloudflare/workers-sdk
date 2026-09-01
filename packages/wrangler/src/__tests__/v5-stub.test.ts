import { getV5MigrationMessage } from "../v5-stub";

describe("Wrangler v5 migration stub", () => {
	it("shows people how to move from Wrangler to cf", ({ expect }) => {
		const message = getV5MigrationMessage(false);

		expect(message).toContain("Wrangler has moved to the Cloudflare CLI (cf).");
		expect(message).toContain("npm uninstall wrangler");
		expect(message).toContain("npm install --save-dev cf");
		expect(message).toContain("wrangler deploy  -> cf deploy");
	});

	it("gives coding agents explicit project migration instructions", ({
		expect,
	}) => {
		const message = getV5MigrationMessage(true);

		expect(message).toContain("WRANGLER_V5_MIGRATION_REQUIRED");
		expect(message).toContain("Do not continue using, invoke, or reinstall");
		expect(message).toContain(
			'Replace "wrangler" commands in package scripts, CI, and documentation with "cf".'
		);
		expect(message).toContain("npm uninstall --global wrangler");
	});
});
