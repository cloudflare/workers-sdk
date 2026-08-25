import { HYPERDRIVE_PLUGIN, Miniflare } from "miniflare";
import { describe, test, vi } from "vitest";
import { singleModuleManifest, useDispose } from "../../test-shared";
import type { Hyperdrive } from "@cloudflare/workers-types/experimental";
import type { MiniflareOptions } from "miniflare";

test("fields match expected", async ({ expect }) => {
	const connectionString = `postgresql://user:password@localhost:5432/database`;
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`export default {
			fetch(request, env) {
				return Response.json({
					connectionString: env.HYPERDRIVE.connectionString,
					user: env.HYPERDRIVE.user,
					password: env.HYPERDRIVE.password,
					database: env.HYPERDRIVE.database,
					host: env.HYPERDRIVE.host,
					port: env.HYPERDRIVE.port,
				});
			}
		}`),
					env: {
						HYPERDRIVE: {
							type: "hyperdrive",
							id: "hyperdrive",
							dev: { connectionString },
						},
					},
				},
			},
		],
	});
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost/");
	const hyperdrive = (await res.json()) as Record<string, unknown>;
	// Since the host is random, this connectionString should be different
	expect(hyperdrive.connectionString).not.toBe(connectionString);
	expect(hyperdrive.user).toBe("user");
	expect(hyperdrive.password).toBe("password");
	expect(hyperdrive.database).toBe("database");
	// Random host should not be the same as the original
	expect(hyperdrive.host).not.toBe("localhost");
	expect(hyperdrive.port).toBe(5432);
});

test("fields in binding proxy match expected", async ({ expect }) => {
	const connectionString = "postgresql://user:password@localhost:5432/database";
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest("export default { fetch() {} }"),
					env: {
						HYPERDRIVE: {
							type: "hyperdrive",
							id: "hyperdrive",
							dev: { connectionString },
						},
					},
				},
			},
		],
	});
	useDispose(mf);
	const { HYPERDRIVE } = await mf.getBindings<{ HYPERDRIVE: Hyperdrive }>();
	expect(HYPERDRIVE.user).toBe("user");
	expect(HYPERDRIVE.password).toBe("password");
	expect(HYPERDRIVE.database).toBe("database");
	expect(HYPERDRIVE.port).toBe(5432);

	// Important: the checks below differ from what the worker code would get inside workerd, this is necessary since getting the binding via `getBindings` implies that
	//            the binding is going to be used inside node.js and not within workerd where the hyperdrive connection is actually set, so the values need need to remain
	//            the exact same making the hyperdrive binding work as a simple no-op/passthrough (returning the workerd hyperdrive values wouldn't work as those would not
	//            work/have any meaning in a node.js process)
	expect(HYPERDRIVE.connectionString).toBe(connectionString);
	expect(HYPERDRIVE.host).toBe("localhost");
});

test("validates config", async ({ expect }) => {
	const opts: MiniflareOptions = {
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(""),
				},
			},
		],
	};
	const mf = new Miniflare(opts);
	useDispose(mf);

	function withHyperdrive(connectionString: string): MiniflareOptions {
		return {
			workers: [
				{
					config: {
						type: "worker",
						name: "",
						compatibilityDate: "2025-05-01",
						manifest: singleModuleManifest(""),
						env: {
							HYPERDRIVE: {
								type: "hyperdrive",
								id: "hyperdrive",
								dev: { connectionString },
							},
						},
					},
				},
			],
		};
	}

	// Check requires Postgres protocol
	await expect(
		mf.setOptions(
			withHyperdrive("mariadb://user:password@localhost:3306/database")
		)
	).rejects.toThrow(
		/Only PostgreSQL-compatible or MySQL-compatible databases are currently supported./
	);

	// Check requires host
	await expect(
		mf.setOptions(withHyperdrive("postgres:///database"))
	).rejects.toThrow(
		/You must provide a hostname or IP address in your connection string/
	);

	// Check requires database name
	await expect(
		mf.setOptions(withHyperdrive("postgres://user:password@localhost:5432"))
	).rejects.toThrow(/You must provide a database name as the path component/);

	// Check requires username
	await expect(
		mf.setOptions(withHyperdrive("postgres://localhost:5432/database"))
	).rejects.toThrow(/You must provide a username/);

	// Check requires password
	await expect(
		mf.setOptions(withHyperdrive("postgres://user@localhost:5432/database"))
	).rejects.toThrow(/You must provide a password/);
});

test("sets default port based on protocol", async ({ expect }) => {
	const script = `export default {
			fetch(request, env) {
				return new Response(env.HYPERDRIVE.port);
			}
		}`;
	// Check defaults port to 5432 for Postgres
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(script),
					env: {
						HYPERDRIVE: {
							type: "hyperdrive",
							id: "hyperdrive",
							dev: {
								connectionString:
									"postgresql://user:password@localhost/database",
							},
						},
					},
				},
			},
		],
	});
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost/");
	expect(await res.text()).toBe("5432");

	// The config schema types `dev.connectionString` as a string, so URL
	// objects (accepted by the old `hyperdrives` option) must be serialised.
	await mf.setOptions({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(script),
					env: {
						HYPERDRIVE: {
							type: "hyperdrive",
							id: "hyperdrive",
							dev: {
								connectionString: new URL(
									"postgres://user:password@localhost/database"
								).toString(),
							},
						},
					},
				},
			},
		],
	});
	res = await mf.dispatchFetch("http://localhost/");
	expect(await res.text()).toBe("5432");
});

describe("proxy server creation", () => {
	type GetServicesOptions = Parameters<typeof HYPERDRIVE_PLUGIN.getServices>[0];
	type HyperdriveProxyController =
		GetServicesOptions["hyperdriveProxyController"];

	function createMockProxyController() {
		return {
			createProxyServer: vi.fn().mockResolvedValue(12345),
			dispose: vi.fn().mockResolvedValue(undefined),
		} as unknown as HyperdriveProxyController & {
			createProxyServer: ReturnType<typeof vi.fn>;
		};
	}

	function serviceOpts(
		hyperdrives: Record<string, URL>,
		controller: HyperdriveProxyController & {
			createProxyServer: ReturnType<typeof vi.fn>;
		}
	) {
		// Returns hyperdrive services from the hyperdrive_plugin
		return {
			options: {
				config: {
					env: Object.fromEntries(
						Object.entries(hyperdrives).map(([name, url]) => [
							name,
							{
								type: "hyperdrive",
								id: name,
								dev: { connectionString: url },
							},
						])
					),
				},
			},
			hyperdriveProxyController: controller,
		} as unknown as Parameters<typeof HYPERDRIVE_PLUGIN.getServices>[0];
	}

	test("skips proxy when sslmode is not specified (postgres)", async ({
		expect,
	}) => {
		const controller = createMockProxyController();
		const services = await HYPERDRIVE_PLUGIN.getServices(
			serviceOpts(
				{ DB: new URL("postgres://user:pass@db.example.com:5432/mydb") },
				controller
			)
		);
		expect(controller.createProxyServer).not.toHaveBeenCalled();
		expect(services).toEqual([
			{
				name: "hyperdrive:DB",
				external: { address: "db.example.com:5432", tcp: {} },
			},
		]);
	});

	test("skips proxy when sslmode is explicitly disabled (postgres)", async ({
		expect,
	}) => {
		const controller = createMockProxyController();
		const services = await HYPERDRIVE_PLUGIN.getServices(
			serviceOpts(
				{
					DB: new URL(
						"postgres://user:pass@db.example.com:5432/mydb?sslmode=disable"
					),
				},
				controller
			)
		);
		expect(controller.createProxyServer).not.toHaveBeenCalled();
		expect(services).toEqual([
			{
				name: "hyperdrive:DB",
				external: { address: "db.example.com:5432", tcp: {} },
			},
		]);
	});

	test("wraps IPv6 hosts when skipping proxy for disabled sslmode", async ({
		expect,
	}) => {
		const controller = createMockProxyController();
		const services = await HYPERDRIVE_PLUGIN.getServices(
			serviceOpts(
				{
					DB: new URL("postgres://user:pass@[::1]:5432/mydb?sslmode=disable"),
				},
				controller
			)
		);
		expect(controller.createProxyServer).not.toHaveBeenCalled();
		expect(services).toEqual([
			{
				name: "hyperdrive:DB",
				external: { address: "[::1]:5432", tcp: {} },
			},
		]);
	});

	test("skips proxy when ssl-mode is disabled (mysql)", async ({ expect }) => {
		const controller = createMockProxyController();
		const services = await HYPERDRIVE_PLUGIN.getServices(
			serviceOpts(
				{
					DB: new URL(
						"mysql://user:pass@db.example.com:3306/mydb?ssl-mode=disabled"
					),
				},
				controller
			)
		);
		expect(controller.createProxyServer).not.toHaveBeenCalled();
		expect(services).toEqual([
			{
				name: "hyperdrive:DB",
				external: { address: "db.example.com:3306", tcp: {} },
			},
		]);
	});

	test("creates proxy when sslmode=require (postgres)", async ({ expect }) => {
		const controller = createMockProxyController();
		const services = await HYPERDRIVE_PLUGIN.getServices(
			serviceOpts(
				{
					DB: new URL(
						"postgres://user:pass@db.example.com:5432/mydb?sslmode=require"
					),
				},
				controller
			)
		);
		expect(controller.createProxyServer).toHaveBeenCalledOnce();
		expect(controller.createProxyServer).toHaveBeenCalledWith({
			name: "DB",
			targetHost: "db.example.com",
			targetPort: "5432",
			scheme: "postgres",
			sslmode: "require",
		});
		expect(services).toEqual([
			{
				name: "hyperdrive:DB",
				external: { address: "127.0.0.1:12345", tcp: {} },
			},
		]);
	});

	test("creates proxy when sslmode=prefer (postgres)", async ({ expect }) => {
		const controller = createMockProxyController();
		const services = await HYPERDRIVE_PLUGIN.getServices(
			serviceOpts(
				{
					DB: new URL(
						"postgres://user:pass@db.example.com:5432/mydb?sslmode=prefer"
					),
				},
				controller
			)
		);
		expect(controller.createProxyServer).toHaveBeenCalledOnce();
		expect(controller.createProxyServer).toHaveBeenCalledWith({
			name: "DB",
			targetHost: "db.example.com",
			targetPort: "5432",
			scheme: "postgres",
			sslmode: "prefer",
		});
		expect(services).toEqual([
			{
				name: "hyperdrive:DB",
				external: { address: "127.0.0.1:12345", tcp: {} },
			},
		]);
	});

	test("creates proxy when ssl-mode=required (mysql)", async ({ expect }) => {
		const controller = createMockProxyController();
		const services = await HYPERDRIVE_PLUGIN.getServices(
			serviceOpts(
				{
					DB: new URL(
						"mysql://user:pass@db.example.com:3306/mydb?ssl-mode=required"
					),
				},
				controller
			)
		);
		expect(controller.createProxyServer).toHaveBeenCalledOnce();
		expect(controller.createProxyServer).toHaveBeenCalledWith({
			name: "DB",
			targetHost: "db.example.com",
			targetPort: "3306",
			scheme: "mysql",
			sslmode: "require",
		});
		expect(services).toEqual([
			{
				name: "hyperdrive:DB",
				external: { address: "127.0.0.1:12345", tcp: {} },
			},
		]);
	});
});
