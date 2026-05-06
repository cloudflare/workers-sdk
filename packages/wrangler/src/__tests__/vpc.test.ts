import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { ServiceType } from "../vpc/index";
import { validateResolverIps } from "../vpc/network/validation";
import {
	extractPortFromHostname,
	validateHostname,
	validateRequest,
} from "../vpc/validation";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type {
	ConnectivityService,
	ConnectivityServiceRequest,
} from "../vpc/index";
import type {
	ConnectivityNetwork,
	CreateConnectivityNetworkRequest,
	UpdateConnectivityNetworkRequest,
} from "../vpc/network/index";
import type { ServiceArgs } from "../vpc/validation";

describe("vpc help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help text when no arguments are passed", async ({
		expect,
	}) => {
		await runWrangler("vpc");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler vpc

			🌐 Manage VPC [open beta]

			COMMANDS
			  wrangler vpc service  🔗 Manage VPC services
			  wrangler vpc network  🌐 Manage VPC networks [open beta]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should show service help text when no service arguments are passed", async ({
		expect,
	}) => {
		await runWrangler("vpc service");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler vpc service

			🔗 Manage VPC services

			COMMANDS
			  wrangler vpc service create <name>        Create a new VPC service
			  wrangler vpc service delete <service-id>  Delete a VPC service
			  wrangler vpc service get <service-id>     Get a VPC service
			  wrangler vpc service list                 List VPC services
			  wrangler vpc service update <service-id>  Update a VPC service

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});
});

describe("vpc service commands", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	const std = mockConsoleMethods();

	beforeEach(() => {
		// @ts-expect-error we're using a very simple setTimeout mock here
		vi.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
			setImmediate(fn);
		});
		setIsTTY(true);
	});

	afterEach(() => {
		clearDialogs();
	});

	it("should handle creating an HTTP service with IPv4", async ({ expect }) => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-http-ipv4 --type http --ipv4 10.0.0.1 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "host": {
			    "ipv4": "10.0.0.1",
			    "network": {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440000",
			    },
			  },
			  "name": "test-http-ipv4",
			  "type": "http",
			}
		`);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating VPC service 'test-http-ipv4'
			✅ Created VPC service: service-uuid
			   Name: test-http-ipv4
			   Type: http
			   IPv4: 10.0.0.1
			   Tunnel ID: 550e8400-e29b-41d4-a716-446655440000"
		`);
	});

	it("should handle creating a service with hostname and resolver network", async ({
		expect,
	}) => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-hostname --type http --http-port 80 --hostname db.example.com --tunnel-id 550e8400-e29b-41d4-a716-446655440002 --resolver-ips 8.8.8.8,8.8.4.4"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "host": {
			    "hostname": "db.example.com",
			    "resolver_network": {
			      "resolver_ips": [
			        "8.8.8.8",
			        "8.8.4.4",
			      ],
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440002",
			    },
			  },
			  "http_port": 80,
			  "name": "test-hostname",
			  "type": "http",
			}
		`);
	});

	it("should reject service creation with both IP addresses and hostname", async ({
		expect,
	}) => {
		await expect(() =>
			runWrangler(
				"vpc service create test-invalid --type http --http-port 80 --ipv4 10.0.0.1 --hostname example.com --resolver-ips=1.1.1.1 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments ipv4 and hostname are mutually exclusive[0m

			"
		`);
	});

	it("should handle listing services", async ({ expect }) => {
		mockWvpcServiceList();
		await runWrangler("vpc service list");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			📋 Listing VPC services
			┌─┬─┬─┬─┬─┬─┬─┬─┐
			│ id │ name │ type │ ports │ host │ tunnel │ created │ modified │
			├─┼─┼─┼─┼─┼─┼─┼─┤
			│ service-uuid │ test-web-service │ http │ HTTP:80, HTTPS:443 │ web.example.com │ tunnel-y... │ 1/1/2024, 12:00:00 AM │ 1/1/2024, 12:00:00 AM │
			└─┴─┴─┴─┴─┴─┴─┴─┘"
		`);
	});

	it("should handle getting a service", async ({ expect }) => {
		mockWvpcServiceGetUpdateDelete();
		await runWrangler("vpc service get service-uuid");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🔍 Getting VPC service 'service-uuid'
			✅ Retrieved VPC service: service-uuid
			   Name: test-web-service
			   Type: http
			   HTTP Port: 80
			   HTTPS Port: 443
			   Hostname: web.example.com
			   Tunnel ID: tunnel-yyyy-yyyy-yyyy-yyyyyyyyyyyy
			   Resolver IPs: 8.8.8.8, 8.8.4.4
			   Created: 1/1/2024, 12:00:00 AM
			   Modified: 1/1/2024, 12:00:00 AM"
		`);
	});

	it("should handle deleting a service", async ({ expect }) => {
		mockWvpcServiceGetUpdateDelete();
		await runWrangler("vpc service delete service-uuid");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🗑️  Deleting VPC service 'service-uuid'
			✅ Deleted VPC service: service-uuid"
		`);
	});

	it("should handle updating a service", async ({ expect }) => {
		const reqProm = mockWvpcServiceUpdate();
		await runWrangler(
			"vpc service update service-uuid --name test-updated --type http --http-port 80 --ipv4 10.0.0.2 --tunnel-id 550e8400-e29b-41d4-a716-446655440001"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "host": {
			    "ipv4": "10.0.0.2",
			    "network": {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440001",
			    },
			  },
			  "http_port": 80,
			  "name": "test-updated",
			  "type": "http",
			}
		`);
	});

	it("should handle getting a service without resolver_ips", async ({
		expect,
	}) => {
		const serviceWithoutResolverIps: ConnectivityService = {
			...mockService,
			host: {
				hostname: "web.example.com",
				resolver_network: {
					tunnel_id: "tunnel-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
					// No resolver_ips property
				},
			},
		};

		msw.use(
			http.get(
				"*/accounts/:accountId/connectivity/directory/services/:serviceId",
				() => {
					return HttpResponse.json(
						createFetchResult(serviceWithoutResolverIps, true)
					);
				},
				{ once: true }
			)
		);

		await runWrangler("vpc service get service-uuid");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🔍 Getting VPC service 'service-uuid'
			✅ Retrieved VPC service: service-uuid
			   Name: test-web-service
			   Type: http
			   HTTP Port: 80
			   HTTPS Port: 443
			   Hostname: web.example.com
			   Tunnel ID: tunnel-yyyy-yyyy-yyyy-yyyyyyyyyyyy
			   Created: 1/1/2024, 12:00:00 AM
			   Modified: 1/1/2024, 12:00:00 AM"
		`);
	});

	it("should handle creating a service and display without resolver_ips", async ({
		expect,
	}) => {
		const serviceResponse = {
			service_id: "service-uuid",
			type: "http",
			name: "test-no-resolver",
			http_port: 80,
			https_port: 443,
			host: {
				hostname: "db.example.com",
				resolver_network: {
					tunnel_id: "550e8400-e29b-41d4-a716-446655440002",
					// No resolver_ips
				},
			},
			created_at: "2024-01-01T00:00:00Z",
			updated_at: "2024-01-01T00:00:00Z",
		};

		msw.use(
			http.post(
				"*/accounts/:accountId/connectivity/directory/services",
				() => {
					return HttpResponse.json(createFetchResult(serviceResponse, true));
				},
				{ once: true }
			)
		);

		await runWrangler(
			"vpc service create test-no-resolver --type http --hostname db.example.com --tunnel-id 550e8400-e29b-41d4-a716-446655440002"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating VPC service 'test-no-resolver'
			✅ Created VPC service: service-uuid
			   Name: test-no-resolver
			   Type: http
			   HTTP Port: 80
			   HTTPS Port: 443
			   Hostname: db.example.com
			   Tunnel ID: 550e8400-e29b-41d4-a716-446655440002"
		`);
	});

	it("should handle creating a TCP service with IPv4", async ({ expect }) => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-tcp-db --type tcp --tcp-port 5432 --ipv4 10.0.0.5 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "host": {
			    "ipv4": "10.0.0.5",
			    "network": {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440000",
			    },
			  },
			  "name": "test-tcp-db",
			  "tcp_port": 5432,
			  "type": "tcp",
			}
		`);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating VPC service 'test-tcp-db'
			✅ Created VPC service: service-uuid
			   Name: test-tcp-db
			   Type: tcp
			   TCP Port: 5432
			   IPv4: 10.0.0.5
			   Tunnel ID: 550e8400-e29b-41d4-a716-446655440000"
		`);
	});

	it("should handle creating a TCP service with hostname", async ({
		expect,
	}) => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-tcp-hostname --type tcp --tcp-port 3306 --hostname mysql.internal --tunnel-id 550e8400-e29b-41d4-a716-446655440001 --resolver-ips 10.0.0.1"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "host": {
			    "hostname": "mysql.internal",
			    "resolver_network": {
			      "resolver_ips": [
			        "10.0.0.1",
			      ],
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440001",
			    },
			  },
			  "name": "test-tcp-hostname",
			  "tcp_port": 3306,
			  "type": "tcp",
			}
		`);
	});

	it("should reject TCP service creation without --tcp-port", async ({
		expect,
	}) => {
		await expect(() =>
			runWrangler(
				"vpc service create test-tcp-no-port --type tcp --ipv4 10.0.0.1 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
			)
		).rejects.toThrow("TCP services require a --tcp-port to be specified");
	});

	it("should handle updating a TCP service", async ({ expect }) => {
		const reqProm = mockWvpcServiceUpdate();
		await runWrangler(
			"vpc service update service-uuid --name test-tcp-updated --type tcp --tcp-port 5433 --ipv4 10.0.0.6 --tunnel-id 550e8400-e29b-41d4-a716-446655440001"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "host": {
			    "ipv4": "10.0.0.6",
			    "network": {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440001",
			    },
			  },
			  "name": "test-tcp-updated",
			  "tcp_port": 5433,
			  "type": "tcp",
			}
		`);
	});

	it("should handle getting a TCP service", async ({ expect }) => {
		mockWvpcTcpServiceGet();
		await runWrangler("vpc service get tcp-service-uuid");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🔍 Getting VPC service 'tcp-service-uuid'
			✅ Retrieved VPC service: tcp-service-uuid
			   Name: test-tcp-service
			   Type: tcp
			   TCP Port: 5432
			   App Protocol: postgresql
			   IPv4: 10.0.0.5
			   Tunnel ID: 550e8400-e29b-41d4-a716-446655440000
			   Created: 1/1/2024, 12:00:00 AM
			   Modified: 1/1/2024, 12:00:00 AM"
		`);
	});

	it("should handle listing TCP services with port in table", async ({
		expect,
	}) => {
		mockWvpcTcpServiceList();
		await runWrangler("vpc service list");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			📋 Listing VPC services
			┌─┬─┬─┬─┬─┬─┬─┬─┐
			│ id │ name │ type │ ports │ host │ tunnel │ created │ modified │
			├─┼─┼─┼─┼─┼─┼─┼─┤
			│ tcp-service-uuid │ test-tcp-service │ tcp │ TCP:5432 (postgresql) │ 10.0.0.5 │ 550e8400... │ 1/1/2024, 12:00:00 AM │ 1/1/2024, 12:00:00 AM │
			└─┴─┴─┴─┴─┴─┴─┴─┘"
		`);
	});

	it("should handle creating a TCP service with --app-protocol postgresql", async ({
		expect,
	}) => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-pg --type tcp --tcp-port 5432 --app-protocol postgresql --ipv4 10.0.0.5 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "app_protocol": "postgresql",
			  "host": {
			    "ipv4": "10.0.0.5",
			    "network": {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440000",
			    },
			  },
			  "name": "test-pg",
			  "tcp_port": 5432,
			  "type": "tcp",
			}
		`);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating VPC service 'test-pg'
			✅ Created VPC service: service-uuid
			   Name: test-pg
			   Type: tcp
			   TCP Port: 5432
			   App Protocol: postgresql
			   IPv4: 10.0.0.5
			   Tunnel ID: 550e8400-e29b-41d4-a716-446655440000"
		`);
	});

	it("should handle creating a TCP service with --app-protocol mysql", async ({
		expect,
	}) => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-mysql --type tcp --tcp-port 3306 --app-protocol mysql --ipv4 10.0.0.6 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "app_protocol": "mysql",
			  "host": {
			    "ipv4": "10.0.0.6",
			    "network": {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440000",
			    },
			  },
			  "name": "test-mysql",
			  "tcp_port": 3306,
			  "type": "tcp",
			}
		`);
	});

	it("should reject --app-protocol with invalid value", async ({ expect }) => {
		await expect(() =>
			runWrangler(
				"vpc service create test-bad-proto --type tcp --tcp-port 5432 --app-protocol redis --ipv4 10.0.0.1 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
			)
		).rejects.toThrow();
		expect(std.err).toContain("Invalid values");
		expect(std.err).toContain(
			'Argument: app-protocol, Given: "redis", Choices: "postgresql", "mysql"'
		);
	});

	it("should handle updating a TCP service with --app-protocol", async ({
		expect,
	}) => {
		const reqProm = mockWvpcServiceUpdate();
		await runWrangler(
			"vpc service update service-uuid --name test-pg-updated --type tcp --tcp-port 5432 --app-protocol postgresql --ipv4 10.0.0.5 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "app_protocol": "postgresql",
			  "host": {
			    "ipv4": "10.0.0.5",
			    "network": {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440000",
			    },
			  },
			  "name": "test-pg-updated",
			  "tcp_port": 5432,
			  "type": "tcp",
			}
		`);
	});

	it("should handle creating a TCP service with --cert-verification-mode verify_ca", async ({
		expect,
	}) => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-tcp-tls --type tcp --tcp-port 5432 --ipv4 10.0.0.5 --tunnel-id 550e8400-e29b-41d4-a716-446655440000 --cert-verification-mode verify_ca"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "host": {
			    "ipv4": "10.0.0.5",
			    "network": {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440000",
			    },
			  },
			  "name": "test-tcp-tls",
			  "tcp_port": 5432,
			  "tls_settings": {
			    "cert_verification_mode": "verify_ca",
			  },
			  "type": "tcp",
			}
		`);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating VPC service 'test-tcp-tls'
			✅ Created VPC service: service-uuid
			   Name: test-tcp-tls
			   Type: tcp
			   TCP Port: 5432
			   Cert Verification Mode: verify_ca
			   IPv4: 10.0.0.5
			   Tunnel ID: 550e8400-e29b-41d4-a716-446655440000"
		`);
	});

	it("should handle creating an HTTP service with --cert-verification-mode disabled", async ({
		expect,
	}) => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-http-tls --type http --http-port 80 --ipv4 10.0.0.1 --tunnel-id 550e8400-e29b-41d4-a716-446655440000 --cert-verification-mode disabled"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "host": {
			    "ipv4": "10.0.0.1",
			    "network": {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440000",
			    },
			  },
			  "http_port": 80,
			  "name": "test-http-tls",
			  "tls_settings": {
			    "cert_verification_mode": "disabled",
			  },
			  "type": "http",
			}
		`);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating VPC service 'test-http-tls'
			✅ Created VPC service: service-uuid
			   Name: test-http-tls
			   Type: http
			   HTTP Port: 80
			   Cert Verification Mode: disabled
			   IPv4: 10.0.0.1
			   Tunnel ID: 550e8400-e29b-41d4-a716-446655440000"
		`);
	});

	it("should not include tls_settings when --cert-verification-mode is not specified", async ({
		expect,
	}) => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-no-tls --type tcp --tcp-port 5432 --ipv4 10.0.0.5 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
		);

		const reqBody = await reqProm;
		expect(reqBody.tls_settings).toBeUndefined();
	});

	it("should handle getting a service with tls_settings", async ({
		expect,
	}) => {
		const serviceWithTls: ConnectivityService = {
			...mockTcpService,
			tls_settings: {
				cert_verification_mode: "verify_ca",
			},
		};

		msw.use(
			http.get(
				"*/accounts/:accountId/connectivity/directory/services/:serviceId",
				() => {
					return HttpResponse.json(createFetchResult(serviceWithTls, true));
				},
				{ once: true }
			)
		);

		await runWrangler("vpc service get tcp-service-uuid");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🔍 Getting VPC service 'tcp-service-uuid'
			✅ Retrieved VPC service: tcp-service-uuid
			   Name: test-tcp-service
			   Type: tcp
			   TCP Port: 5432
			   App Protocol: postgresql
			   Cert Verification Mode: verify_ca
			   IPv4: 10.0.0.5
			   Tunnel ID: 550e8400-e29b-41d4-a716-446655440000
			   Created: 1/1/2024, 12:00:00 AM
			   Modified: 1/1/2024, 12:00:00 AM"
		`);
	});

	it("should handle updating a service with --cert-verification-mode", async ({
		expect,
	}) => {
		const reqProm = mockWvpcServiceUpdate();
		await runWrangler(
			"vpc service update service-uuid --name test-updated --type http --http-port 80 --ipv4 10.0.0.2 --tunnel-id 550e8400-e29b-41d4-a716-446655440001 --cert-verification-mode verify_full"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "host": {
			    "ipv4": "10.0.0.2",
			    "network": {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440001",
			    },
			  },
			  "http_port": 80,
			  "name": "test-updated",
			  "tls_settings": {
			    "cert_verification_mode": "verify_full",
			  },
			  "type": "http",
			}
		`);
	});

	it("should reject --cert-verification-mode with invalid value", async ({
		expect,
	}) => {
		await expect(() =>
			runWrangler(
				"vpc service create test-bad-tls --type tcp --tcp-port 5432 --ipv4 10.0.0.1 --tunnel-id 550e8400-e29b-41d4-a716-446655440000 --cert-verification-mode invalid"
			)
		).rejects.toThrow();
		expect(std.err).toContain("Invalid values");
		expect(std.err).toContain("cert-verification-mode");
		expect(std.err).toContain('"invalid"');
	});

	it("should extract port from hostname for TCP services", async ({
		expect,
	}) => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-tcp-hostport --type tcp --hostname mysql.internal:3306 --tunnel-id 550e8400-e29b-41d4-a716-446655440001"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "host": {
			    "hostname": "mysql.internal",
			    "resolver_network": {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440001",
			    },
			  },
			  "name": "test-tcp-hostport",
			  "tcp_port": 3306,
			  "type": "tcp",
			}
		`);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating VPC service 'test-tcp-hostport'
			✅ Created VPC service: service-uuid
			   Name: test-tcp-hostport
			   Type: tcp
			   TCP Port: 3306
			   Hostname: mysql.internal
			   Tunnel ID: 550e8400-e29b-41d4-a716-446655440001"
		`);
	});

	it("should accept matching --tcp-port when hostname also includes port", async ({
		expect,
	}) => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-tcp-match --type tcp --tcp-port 5432 --hostname db.internal:5432 --tunnel-id 550e8400-e29b-41d4-a716-446655440001"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "host": {
			    "hostname": "db.internal",
			    "resolver_network": {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440001",
			    },
			  },
			  "name": "test-tcp-match",
			  "tcp_port": 5432,
			  "type": "tcp",
			}
		`);
	});

	it("should reject conflicting --tcp-port and hostname port", async ({
		expect,
	}) => {
		await expect(() =>
			runWrangler(
				"vpc service create test-tcp-conflict --type tcp --tcp-port 5432 --hostname db.internal:3306 --tunnel-id 550e8400-e29b-41d4-a716-446655440001"
			)
		).rejects.toThrow(
			"Conflicting TCP port: --hostname includes port 3306 but --tcp-port is 5432"
		);
	});
});

describe("extractPortFromHostname", () => {
	it("should extract port from hostname:port", ({ expect }) => {
		expect(extractPortFromHostname("db.example.com:5432")).toEqual({
			hostname: "db.example.com",
			port: 5432,
		});
	});

	it("should return undefined port for plain hostname", ({ expect }) => {
		expect(extractPortFromHostname("db.example.com")).toEqual({
			hostname: "db.example.com",
			port: undefined,
		});
	});

	it("should not extract port from IPv6 addresses", ({ expect }) => {
		expect(extractPortFromHostname("2001:db8::1")).toEqual({
			hostname: "2001:db8::1",
			port: undefined,
		});
	});

	it("should not extract port from bracketed IPv6 addresses", ({ expect }) => {
		expect(extractPortFromHostname("[::1]")).toEqual({
			hostname: "[::1]",
			port: undefined,
		});
	});

	it("should handle port at boundary values", ({ expect }) => {
		expect(extractPortFromHostname("host:1")).toEqual({
			hostname: "host",
			port: 1,
		});
		expect(extractPortFromHostname("host:65535")).toEqual({
			hostname: "host",
			port: 65535,
		});
	});

	it("should reject port 0 or above 65535", ({ expect }) => {
		expect(extractPortFromHostname("host:0")).toEqual({
			hostname: "host:0",
			port: undefined,
		});
		expect(extractPortFromHostname("host:65536")).toEqual({
			hostname: "host:65536",
			port: undefined,
		});
	});
});

describe("hostname validation", () => {
	it("should accept valid hostnames", ({ expect }) => {
		expect(() => validateHostname("api.example.com")).not.toThrow();
		expect(() => validateHostname("localhost")).not.toThrow();
		expect(() => validateHostname("my-service.internal.local")).not.toThrow();
		expect(() => validateHostname("sub.domain.example.co.uk")).not.toThrow();
	});

	it("should reject empty hostname", ({ expect }) => {
		expect(() => validateHostname("")).toThrow("Hostname cannot be empty.");
		expect(() => validateHostname("   ")).toThrow("Hostname cannot be empty.");
	});

	it("should reject hostname exceeding 253 characters", ({ expect }) => {
		const longHostname = "a".repeat(254);
		expect(() => validateHostname(longHostname)).toThrow(
			"Hostname is too long. Maximum length is 253 characters."
		);
	});

	it("should accept hostname at exactly 253 characters", ({ expect }) => {
		const label = "a".repeat(63);
		const hostname = `${label}.${label}.${label}.${label.slice(0, 61)}`;
		expect(hostname.length).toBe(253);
		expect(() => validateHostname(hostname)).not.toThrow();
	});

	it("should reject hostname with URL scheme", ({ expect }) => {
		expect(() => validateHostname("https://example.com")).toThrow(
			"Hostname must not include a URL scheme"
		);
		expect(() => validateHostname("http://example.com")).toThrow(
			"Hostname must not include a URL scheme"
		);
	});

	it("should reject hostname with path", ({ expect }) => {
		expect(() => validateHostname("example.com/path")).toThrow(
			"Hostname must not include a path"
		);
	});

	it("should reject bare IPv4 address", ({ expect }) => {
		expect(() => validateHostname("192.168.1.1")).toThrow(
			"Hostname must not be an IP address. Use --ipv4 or --ipv6 instead."
		);
		expect(() => validateHostname("10.0.0.1")).toThrow(
			"Hostname must not be an IP address"
		);
	});

	it("should reject bare IPv6 address", ({ expect }) => {
		expect(() => validateHostname("::1")).toThrow(
			"Hostname must not be an IP address"
		);
		expect(() => validateHostname("2001:db8::1")).toThrow(
			"Hostname must not be an IP address"
		);
		expect(() => validateHostname("[::1]")).toThrow(
			"Hostname must not be an IP address"
		);
	});

	it("should reject hostname with port", ({ expect }) => {
		expect(() => validateHostname("example.com:8080")).toThrow(
			"Hostname must not include a port number"
		);
	});

	it("should reject hostname with whitespace", ({ expect }) => {
		expect(() => validateHostname("bad host.com")).toThrow(
			"Hostname must not contain whitespace"
		);
	});

	it("should accept hostnames with underscores", ({ expect }) => {
		expect(() => validateHostname("_dmarc.example.com")).not.toThrow();
		expect(() => validateHostname("my_service.internal")).not.toThrow();
	});

	it("should report all applicable errors at once", ({ expect }) => {
		// "https://example.com/path" has a scheme AND a path
		expect(() => validateHostname("https://example.com/path")).toThrow(
			/URL scheme.*\n.*path/s
		);
	});

	it("should reject invalid hostname via wrangler service create", async ({
		expect,
	}) => {
		await expect(() =>
			runWrangler(
				"vpc service create test-bad-hostname --type http --hostname https://example.com --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
			)
		).rejects.toThrow("Hostname must not include a URL scheme");
	});

	it("should reject IP address as hostname via wrangler service create", async ({
		expect,
	}) => {
		await expect(() =>
			runWrangler(
				"vpc service create test-ip-hostname --type http --hostname 192.168.1.1 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
			)
		).rejects.toThrow("Hostname must not be an IP address");
	});
});

describe("IP address validation", () => {
	const baseArgs: ServiceArgs = {
		name: "test",
		type: ServiceType.Http,
		tunnelId: "550e8400-e29b-41d4-a716-446655440000",
	};

	it("should accept valid IPv4 addresses", ({ expect }) => {
		expect(() =>
			validateRequest({ ...baseArgs, ipv4: "192.168.1.1" })
		).not.toThrow();
		expect(() =>
			validateRequest({ ...baseArgs, ipv4: "10.0.0.1" })
		).not.toThrow();
	});

	it("should reject invalid IPv4 addresses", ({ expect }) => {
		expect(() => validateRequest({ ...baseArgs, ipv4: "not-an-ip" })).toThrow(
			"Invalid IPv4 address"
		);
		expect(() =>
			validateRequest({ ...baseArgs, ipv4: "999.999.999.999" })
		).toThrow("Invalid IPv4 address");
		expect(() => validateRequest({ ...baseArgs, ipv4: "example.com" })).toThrow(
			"Invalid IPv4 address"
		);
	});

	it("should accept valid IPv6 addresses", ({ expect }) => {
		expect(() => validateRequest({ ...baseArgs, ipv6: "::1" })).not.toThrow();
		expect(() =>
			validateRequest({ ...baseArgs, ipv6: "2001:db8::1" })
		).not.toThrow();
	});

	it("should reject invalid IPv6 addresses", ({ expect }) => {
		expect(() => validateRequest({ ...baseArgs, ipv6: "not-an-ip" })).toThrow(
			"Invalid IPv6 address"
		);
		expect(() => validateRequest({ ...baseArgs, ipv6: "192.168.1.1" })).toThrow(
			"Invalid IPv6 address"
		);
	});

	it("should accept valid resolver IPs", ({ expect }) => {
		expect(() =>
			validateRequest({
				...baseArgs,
				hostname: "example.com",
				resolverIps: "8.8.8.8,8.8.4.4",
			})
		).not.toThrow();
		expect(() =>
			validateRequest({
				...baseArgs,
				hostname: "example.com",
				resolverIps: "2001:db8::1",
			})
		).not.toThrow();
	});

	it("should reject invalid resolver IPs", ({ expect }) => {
		expect(() =>
			validateRequest({
				...baseArgs,
				hostname: "example.com",
				resolverIps: "not-an-ip",
			})
		).toThrow("Invalid resolver IP address(es): 'not-an-ip'");
		expect(() =>
			validateRequest({
				...baseArgs,
				hostname: "example.com",
				resolverIps: "8.8.8.8,bad-ip,1.1.1.1",
			})
		).toThrow("Invalid resolver IP address(es): 'bad-ip'");
	});
});

const mockService: ConnectivityService = {
	service_id: "service-uuid",
	type: ServiceType.Http,
	name: "test-web-service",
	http_port: 80,
	https_port: 443,
	host: {
		hostname: "web.example.com",
		resolver_network: {
			tunnel_id: "tunnel-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
			resolver_ips: ["8.8.8.8", "8.8.4.4"],
		},
	},
	created_at: "2024-01-01T00:00:00Z",
	updated_at: "2024-01-01T00:00:00Z",
};

const mockTcpService: ConnectivityService = {
	service_id: "tcp-service-uuid",
	type: ServiceType.Tcp,
	name: "test-tcp-service",
	tcp_port: 5432,
	app_protocol: "postgresql",
	host: {
		ipv4: "10.0.0.5",
		network: {
			tunnel_id: "550e8400-e29b-41d4-a716-446655440000",
		},
	},
	created_at: "2024-01-01T00:00:00Z",
	updated_at: "2024-01-01T00:00:00Z",
};

// Mock API Handlers
function mockWvpcServiceCreate(): Promise<ConnectivityServiceRequest> {
	return new Promise((resolve) => {
		msw.use(
			http.post(
				"*/accounts/:accountId/connectivity/directory/services",
				async ({ request }) => {
					const reqBody = (await request.json()) as ConnectivityServiceRequest;
					resolve(reqBody);

					return HttpResponse.json(
						createFetchResult(
							{
								service_id: "service-uuid",
								type: reqBody.type,
								name: reqBody.name,
								tcp_port: reqBody.tcp_port,
								app_protocol: reqBody.app_protocol,
								http_port: reqBody.http_port,
								https_port: reqBody.https_port,
								host: reqBody.host,
								tls_settings: reqBody.tls_settings,
								created_at: "2024-01-01T00:00:00Z",
								updated_at: "2024-01-01T00:00:00Z",
							},
							true
						)
					);
				},
				{ once: true }
			)
		);
	});
}

function mockWvpcServiceUpdate(): Promise<ConnectivityServiceRequest> {
	return new Promise((resolve) => {
		msw.use(
			http.put(
				"*/accounts/:accountId/connectivity/directory/services/:serviceId",
				async ({ request }) => {
					const reqBody = (await request.json()) as ConnectivityServiceRequest;
					resolve(reqBody);

					return HttpResponse.json(
						createFetchResult(
							{
								service_id: "service-uuid",
								type: reqBody.type,
								name: reqBody.name,
								tcp_port: reqBody.tcp_port,
								app_protocol: reqBody.app_protocol,
								http_port: reqBody.http_port,
								https_port: reqBody.https_port,
								host: reqBody.host,
								tls_settings: reqBody.tls_settings,
								created_at: "2024-01-01T00:00:00Z",
								updated_at: "2024-01-01T00:00:00Z",
							},
							true
						)
					);
				},
				{ once: true }
			)
		);
	});
}

function mockWvpcServiceGetUpdateDelete() {
	msw.use(
		http.get(
			"*/accounts/:accountId/connectivity/directory/services/:serviceId",
			() => {
				return HttpResponse.json(createFetchResult(mockService, true));
			},
			{ once: true }
		),
		http.delete(
			"*/accounts/:accountId/connectivity/directory/services/:serviceId",
			() => {
				return HttpResponse.json(createFetchResult(null, true));
			},
			{ once: true }
		)
	);
}

function mockWvpcServiceList() {
	msw.use(
		http.get(
			"*/accounts/:accountId/connectivity/directory/services",
			() => {
				return HttpResponse.json(createFetchResult([mockService], true));
			},
			{ once: true }
		)
	);
}

function mockWvpcTcpServiceGet() {
	msw.use(
		http.get(
			"*/accounts/:accountId/connectivity/directory/services/:serviceId",
			() => {
				return HttpResponse.json(createFetchResult(mockTcpService, true));
			},
			{ once: true }
		)
	);
}

function mockWvpcTcpServiceList() {
	msw.use(
		http.get(
			"*/accounts/:accountId/connectivity/directory/services",
			() => {
				return HttpResponse.json(createFetchResult([mockTcpService], true));
			},
			{ once: true }
		)
	);
}

// ────────────────────────────────────────────────────────────────────────────
// vpc network tests
// ────────────────────────────────────────────────────────────────────────────

const mockNetwork: ConnectivityNetwork = {
	network_id: "network-uuid",
	name: "test-network",
	tunnel_id: "tunnel-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
	resolver_ips: ["8.8.8.8", "8.8.4.4"],
	created_at: "2024-01-01T00:00:00Z",
	updated_at: "2024-01-01T00:00:00Z",
};

describe("vpc network commands", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	const std = mockConsoleMethods();

	beforeEach(() => {
		// @ts-expect-error we're using a very simple setTimeout mock here
		vi.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
			setImmediate(fn);
		});
		setIsTTY(true);
	});

	afterEach(() => {
		clearDialogs();
	});

	it("should show network help text", async ({ expect }) => {
		await runWrangler("vpc network");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler vpc network

			🌐 Manage VPC networks [open beta]

			COMMANDS
			  wrangler vpc network create <name>        Create a new VPC network [open beta]
			  wrangler vpc network delete <network-id>  Delete a VPC network [open beta]
			  wrangler vpc network get <network-id>     Get a VPC network [open beta]
			  wrangler vpc network list                 List VPC networks [open beta]
			  wrangler vpc network update <network-id>  Update a VPC network [open beta]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should handle creating a network without resolver IPs", async ({
		expect,
	}) => {
		const reqProm = mockWvpcNetworkCreate();
		await runWrangler(
			"vpc network create test-network --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "name": "test-network",
			  "tunnel_id": "550e8400-e29b-41d4-a716-446655440000",
			}
		`);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating VPC network 'test-network'
			✅ Created VPC network: network-uuid
			   Name: test-network
			   Tunnel ID: 550e8400-e29b-41d4-a716-446655440000
			   Resolver IPs: Default"
		`);
	});

	it("should handle creating a network with resolver IPs", async ({
		expect,
	}) => {
		const reqProm = mockWvpcNetworkCreate();
		await runWrangler(
			"vpc network create test-network --tunnel-id 550e8400-e29b-41d4-a716-446655440000 --resolver-ips 8.8.8.8,8.8.4.4"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "name": "test-network",
			  "resolver_ips": [
			    "8.8.8.8",
			    "8.8.4.4",
			  ],
			  "tunnel_id": "550e8400-e29b-41d4-a716-446655440000",
			}
		`);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🚧 Creating VPC network 'test-network'
			✅ Created VPC network: network-uuid
			   Name: test-network
			   Tunnel ID: 550e8400-e29b-41d4-a716-446655440000
			   Resolver IPs: 8.8.8.8, 8.8.4.4"
		`);
	});

	it("should handle listing networks", async ({ expect }) => {
		mockWvpcNetworkList();
		await runWrangler("vpc network list");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			📋 Listing VPC networks
			┌─┬─┬─┬─┬─┬─┐
			│ id │ name │ tunnel │ resolver_ips │ created │ modified │
			├─┼─┼─┼─┼─┼─┤
			│ network-uuid │ test-network │ tunnel-y... │ 8.8.8.8, 8.8.4.4 │ 1/1/2024, 12:00:00 AM │ 1/1/2024, 12:00:00 AM │
			└─┴─┴─┴─┴─┴─┘"
		`);
	});

	it("should show 'No VPC networks found' when list is empty", async ({
		expect,
	}) => {
		msw.use(
			http.get(
				"*/accounts/:accountId/connectivity/directory/networks",
				() => {
					return HttpResponse.json(createFetchResult([], true));
				},
				{ once: true }
			)
		);
		await runWrangler("vpc network list");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			📋 Listing VPC networks
			No VPC networks found"
		`);
	});

	it("should handle getting a network", async ({ expect }) => {
		mockWvpcNetworkGetUpdateDelete();
		await runWrangler("vpc network get network-uuid");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🔍 Getting VPC network 'network-uuid'
			✅ Retrieved VPC network: network-uuid
			   Name: test-network
			   Tunnel ID: tunnel-yyyy-yyyy-yyyy-yyyyyyyyyyyy
			   Resolver IPs: 8.8.8.8, 8.8.4.4
			   Created: 1/1/2024, 12:00:00 AM
			   Modified: 1/1/2024, 12:00:00 AM"
		`);
	});

	it("should handle getting a network without resolver IPs", async ({
		expect,
	}) => {
		const networkWithoutResolverIps: ConnectivityNetwork = {
			...mockNetwork,
			resolver_ips: undefined,
		};

		msw.use(
			http.get(
				"*/accounts/:accountId/connectivity/directory/networks/:networkId",
				() => {
					return HttpResponse.json(
						createFetchResult(networkWithoutResolverIps, true)
					);
				},
				{ once: true }
			)
		);

		await runWrangler("vpc network get network-uuid");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🔍 Getting VPC network 'network-uuid'
			✅ Retrieved VPC network: network-uuid
			   Name: test-network
			   Tunnel ID: tunnel-yyyy-yyyy-yyyy-yyyyyyyyyyyy
			   Resolver IPs: Default
			   Created: 1/1/2024, 12:00:00 AM
			   Modified: 1/1/2024, 12:00:00 AM"
		`);
	});

	it("should handle deleting a network", async ({ expect }) => {
		mockWvpcNetworkGetUpdateDelete();
		await runWrangler("vpc network delete network-uuid");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🗑️  Deleting VPC network 'network-uuid'
			✅ Deleted VPC network: network-uuid"
		`);
	});

	it("should surface bound Worker names when deletion is blocked", async ({
		expect,
	}) => {
		// The API returns 400 Bad Request with a NetworkInUse error listing the
		// bound Worker names when a network cannot be deleted because of active
		// bindings. The CLI should surface those names to the user.
		msw.use(
			http.delete(
				"*/accounts/:accountId/connectivity/directory/networks/:networkId",
				() =>
					HttpResponse.json(
						createFetchResult(null, false, [
							{
								// 1003 is a generic InvalidRequest code; anything non-10000
								// avoids wrangler's auth-error branch which would call `/user`.
								code: 1003,
								message:
									"Network is bound to 2 Worker(s): my-worker, another-worker. Unbind them before deletion.",
							},
						]),
						{ status: 400 }
					)
			)
		);

		await expect(
			runWrangler("vpc network delete network-uuid")
		).rejects.toMatchObject({
			notes: expect.arrayContaining([
				{
					text: expect.stringContaining(
						"Network is bound to 2 Worker(s): my-worker, another-worker"
					),
				},
			]),
		});
	});

	it("should handle updating a network name", async ({ expect }) => {
		const reqProm = mockWvpcNetworkUpdate();
		await runWrangler("vpc network update network-uuid --name new-name");

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "name": "new-name",
			}
		`);
	});

	it("should handle updating a network resolver IPs", async ({ expect }) => {
		const reqProm = mockWvpcNetworkUpdate();
		await runWrangler(
			"vpc network update network-uuid --resolver-ips 1.1.1.1,1.0.0.1"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			{
			  "resolver_ips": [
			    "1.1.1.1",
			    "1.0.0.1",
			  ],
			}
		`);
	});
});

describe("vpc network resolver IP validation", () => {
	it("should accept valid IPv4 resolver IPs", ({ expect }) => {
		expect(() => validateResolverIps("8.8.8.8")).not.toThrow();
		expect(() => validateResolverIps("8.8.8.8,1.1.1.1")).not.toThrow();
	});

	it("should accept valid IPv6 resolver IPs", ({ expect }) => {
		expect(() => validateResolverIps("2001:db8::1")).not.toThrow();
	});

	it("should reject empty resolver IPs string", ({ expect }) => {
		expect(() => validateResolverIps("")).toThrow(
			"--resolver-ips must not be empty"
		);
		expect(() => validateResolverIps("   ")).toThrow(
			"--resolver-ips must not be empty"
		);
	});

	it("should reject invalid IP addresses", ({ expect }) => {
		expect(() => validateResolverIps("not-an-ip")).toThrow(
			"Invalid resolver IP address(es): 'not-an-ip'"
		);
		expect(() => validateResolverIps("8.8.8.8,bad-ip")).toThrow(
			"Invalid resolver IP address(es): 'bad-ip'"
		);
	});

	it("should trim whitespace around IPs", ({ expect }) => {
		expect(() => validateResolverIps(" 8.8.8.8 , 1.1.1.1 ")).not.toThrow();
		expect(validateResolverIps(" 8.8.8.8 , 1.1.1.1 ")).toEqual([
			"8.8.8.8",
			"1.1.1.1",
		]);
	});
});

// Mock API Handlers for networks
function mockWvpcNetworkCreate(): Promise<CreateConnectivityNetworkRequest> {
	return new Promise((resolve) => {
		msw.use(
			http.post(
				"*/accounts/:accountId/connectivity/directory/networks",
				async ({ request }) => {
					const reqBody =
						(await request.json()) as CreateConnectivityNetworkRequest;
					resolve(reqBody);

					return HttpResponse.json(
						createFetchResult(
							{
								network_id: "network-uuid",
								name: reqBody.name,
								tunnel_id: reqBody.tunnel_id,
								resolver_ips: reqBody.resolver_ips,
								created_at: "2024-01-01T00:00:00Z",
								updated_at: "2024-01-01T00:00:00Z",
							},
							true
						)
					);
				},
				{ once: true }
			)
		);
	});
}

function mockWvpcNetworkUpdate(): Promise<UpdateConnectivityNetworkRequest> {
	return new Promise((resolve) => {
		msw.use(
			http.put(
				"*/accounts/:accountId/connectivity/directory/networks/:networkId",
				async ({ request }) => {
					const reqBody =
						(await request.json()) as UpdateConnectivityNetworkRequest;
					resolve(reqBody);

					return HttpResponse.json(
						createFetchResult(
							{
								...mockNetwork,
								...reqBody,
							},
							true
						)
					);
				},
				{ once: true }
			)
		);
	});
}

function mockWvpcNetworkGetUpdateDelete() {
	msw.use(
		http.get(
			"*/accounts/:accountId/connectivity/directory/networks/:networkId",
			() => {
				return HttpResponse.json(createFetchResult(mockNetwork, true));
			},
			{ once: true }
		),
		http.delete(
			"*/accounts/:accountId/connectivity/directory/networks/:networkId",
			() => {
				return HttpResponse.json(createFetchResult(null, true));
			},
			{ once: true }
		)
	);
}

function mockWvpcNetworkList() {
	msw.use(
		http.get(
			"*/accounts/:accountId/connectivity/directory/networks",
			() => {
				return HttpResponse.json(createFetchResult([mockNetwork], true));
			},
			{ once: true }
		)
	);
}
