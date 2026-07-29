import { describe, it } from "vitest";
import { buildMiniflareBindingOptions } from "../../dev/miniflare";
import { mockConsoleMethods } from "../helpers/mock-console";
import type { Binding } from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString } from "miniflare";

const remoteProxyConnectionString = new URL(
	"http://localhost:52222/"
) as RemoteProxyConnectionString;

function buildHyperdriveOptions(
	binding: Extract<Binding, { type: "hyperdrive" }>,
	connectionString?: RemoteProxyConnectionString
) {
	const { bindingOptions } = buildMiniflareBindingOptions(
		{
			name: "test-worker",
			complianceRegion: undefined,
			bindings: { HYPERDRIVE: binding },
			queueConsumers: undefined,
			migrations: undefined,
			exports: undefined,
			tails: [],
			streamingTails: [],
			containerDOClassNames: undefined,
			containerBuildId: undefined,
			enableContainers: false,
		},
		connectionString
	);
	return bindingOptions.hyperdrives;
}

describe("hyperdrive bindings in local dev", () => {
	const std = mockConsoleMethods();

	it("passes the local connection string through for a local binding", ({
		expect,
	}) => {
		expect(
			buildHyperdriveOptions({
				type: "hyperdrive",
				id: "hyperdrive-id",
				localConnectionString: "postgres://user:pass@localhost:5432/db",
			})
		).toEqual({ HYPERDRIVE: "postgres://user:pass@localhost:5432/db" });
		expect(std.warn).toBe("");
	});

	it("hands miniflare the remote proxy connection string for a remote binding", ({
		expect,
	}) => {
		expect(
			buildHyperdriveOptions(
				{
					type: "hyperdrive",
					id: "hyperdrive-id",
					remote: true,
				},
				remoteProxyConnectionString
			)
		).toEqual({
			HYPERDRIVE: {
				localConnectionString: undefined,
				remoteProxyConnectionString,
			},
		});
		expect(std.warn).toBe("");
	});

	it("explains how to fix a remote binding that has neither a session nor a local database", ({
		expect,
	}) => {
		expect(() =>
			buildHyperdriveOptions({
				type: "hyperdrive",
				id: "hyperdrive-id",
				remote: true,
			})
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: The Hyperdrive binding "HYPERDRIVE" is configured with "remote": true, but no remote connection could be established, and it has no local database to fall back to. Please make sure you are authenticated (run \`wrangler login\`) and connected to the internet so that Wrangler can reach your Hyperdrive configuration, or set the value of the 'CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE' variable or "HYPERDRIVE"'s "localConnectionString" to a local Postgres connection string.]`
		);
	});

	it("warns when a remote binding without a session falls back to its local database", ({
		expect,
	}) => {
		expect(
			buildHyperdriveOptions({
				type: "hyperdrive",
				id: "hyperdrive-id",
				remote: true,
				localConnectionString: "postgres://user:pass@localhost:5432/db",
			})
		).toEqual({ HYPERDRIVE: "postgres://user:pass@localhost:5432/db" });
		expect(std.warn).toContain(
			`The Hyperdrive binding "HYPERDRIVE" is configured with "remote": true, but no remote connection could be established. Falling back to its "localConnectionString".`
		);
	});
});
