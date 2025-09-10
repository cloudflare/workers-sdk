import { http, HttpResponse } from "msw";
import { vi } from "vitest";
import { ServiceType } from "../vpc/index";
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

describe("vpc help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help text when no arguments are passed", async () => {
		await runWrangler("vpc");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler vpc

			🌐 Manage VPC connectivity [private-beta]

			COMMANDS
			  wrangler vpc service  🔗 Manage VPC connectivity services

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should show service help text when no service arguments are passed", async () => {
		await runWrangler("vpc service");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler vpc service

			🔗 Manage VPC connectivity services

			COMMANDS
			  wrangler vpc service create <name>        Create a new VPC connectivity service
			  wrangler vpc service delete <service-id>  Delete a VPC connectivity service
			  wrangler vpc service get <service-id>     Get a VPC connectivity service
			  wrangler vpc service list                 List VPC connectivity services
			  wrangler vpc service update <service-id>  Update a VPC connectivity service

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

	// TCP Service Creation Tests
	it("should handle creating a TCP service with IPv4", async () => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-tcp --tcp-port 5432 --app-protocol postgresql --ipv4 10.0.0.1 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "app_protocol": "postgresql",
			  "host": Object {
			    "ipv4": "10.0.0.1",
			    "network": Object {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440000",
			    },
			  },
			  "name": "test-tcp",
			  "tcp_port": 5432,
			  "type": "tcp",
			}
		`);

		expect(std.out).toMatchInlineSnapshot(`
			"🚧 Creating VPC connectivity service 'test-tcp'
			✅ Created VPC connectivity service: tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			   Name: test-tcp
			   Type: tcp
			   TCP Port: 5432
			   Protocol: postgresql
			   IPv4: 10.0.0.1
			   Tunnel ID: 550e8400-e29b-41d4-a716-446655440000"
		`);
	});

	it("should handle creating a TCP service with IPv6", async () => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-tcp-v6 --tcp-port 3306 --app-protocol mysql --ipv6 2001:db8::1 --tunnel-id 550e8400-e29b-41d4-a716-446655440001"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "app_protocol": "mysql",
			  "host": Object {
			    "ipv6": "2001:db8::1",
			    "network": Object {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440001",
			    },
			  },
			  "name": "test-tcp-v6",
			  "tcp_port": 3306,
			  "type": "tcp",
			}
		`);
	});

	it("should handle creating a service with hostname and resolver network", async () => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-hostname --http-port 80 --hostname db.example.com --tunnel-id 550e8400-e29b-41d4-a716-446655440002 --resolver-ips 8.8.8.8,8.8.4.4"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "host": Object {
			    "hostname": "db.example.com",
			    "resolver_network": Object {
			      "resolver_ips": Array [
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

	// HTTP Service Creation Tests
	it("should handle creating an HTTP service with dual ports", async () => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-web --http-port 80 --https-port 443 --ipv4 10.0.0.2 --tunnel-id 550e8400-e29b-41d4-a716-446655440003"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "host": Object {
			    "ipv4": "10.0.0.2",
			    "network": Object {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440003",
			    },
			  },
			  "http_port": 80,
			  "https_port": 443,
			  "name": "test-web",
			  "type": "http",
			}
		`);
	});

	it("should handle creating an HTTP service with only HTTPS port", async () => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"vpc service create test-https --https-port 8443 --ipv4 10.0.0.3 --tunnel-id 550e8400-e29b-41d4-a716-446655440004"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "host": Object {
			    "ipv4": "10.0.0.3",
			    "network": Object {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440004",
			    },
			  },
			  "https_port": 8443,
			  "name": "test-https",
			  "type": "http",
			}
		`);
	});

	// Validation Error Tests
	it("should reject service creation with out either tcp-port or http-port/https-port", async () => {
		await expect(() =>
			runWrangler(
				"vpc service create test-tcp --ipv4 10.0.0.1 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mMust specify either TCP options (--tcp-port/--app-protocol) or HTTP options (--http-port/--https-port)[0m

			"
		`);
	});

	it("should reject service creation with both IP addresses and hostname", async () => {
		await expect(() =>
			runWrangler(
				"vpc service create test-invalid --http-port 80 --ipv4 10.0.0.1 --hostname example.com --resolver-ips=1.1.1.1 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments ipv4 and hostname are mutually exclusive[0m

			"
		`);
	});

	it("should reject service creation with hostname but no resolver IPs", async () => {
		await expect(() =>
			runWrangler(
				"vpc service create test-no-resolvers --http-port 80 --hostname example.com --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mMissing dependent arguments:[0m

			   hostname -> resolver-ips

			"
		`);
	});

	it("should reject TCP service creation with HTTP-specific arguments", async () => {
		await expect(() =>
			runWrangler(
				"vpc service create test-mixed --tcp-port 5432 --app-protocol=postgresql --https-port 443 --http-port 80 --ipv4 10.0.0.1 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments tcp-port and http-port are mutually exclusive[0m

			"
		`);
	});

	it("should handle listing services", async () => {
		mockWvpcServiceList();
		await runWrangler("vpc service list");

		expect(std.out).toMatchInlineSnapshot(`
			"📋 Listing VPC connectivity services
			┌─┬─┬─┬─┬─┬─┬─┬─┐
			│ id │ name │ type │ ports │ host │ tunnel │ created │ modified │
			├─┼─┼─┼─┼─┼─┼─┼─┤
			│ tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx │ test-tcp-service │ tcp │ 5432 (postgresql) │ 10.0.0.1 │ tunnel-x... │ 1/1/2024, 12:00:00 AM │ 1/1/2024, 12:00:00 AM │
			├─┼─┼─┼─┼─┼─┼─┼─┤
			│ http-xxxx-xxxx-xxxx-xxxxxxxxxxxx │ test-web-service │ http │ HTTP:80, HTTPS:443 │ web.example.com │ tunnel-y... │ 1/1/2024, 12:00:00 AM │ 1/1/2024, 12:00:00 AM │
			└─┴─┴─┴─┴─┴─┴─┴─┘"
		`);
	});

	it("should handle getting a service", async () => {
		mockWvpcServiceGetUpdateDelete();
		await runWrangler("vpc service get tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx");

		expect(std.out).toMatchInlineSnapshot(`
			"🔍 Getting VPC connectivity service 'tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Retrieved VPC connectivity service: tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			   Name: test-tcp-service
			   Type: tcp
			   TCP Port: 5432
			   Protocol: postgresql
			   IPv4: 10.0.0.1
			   Tunnel ID: tunnel-xxxx-xxxx-xxxx-xxxxxxxxxxxx
			   Created: 1/1/2024, 12:00:00 AM
			   Modified: 1/1/2024, 12:00:00 AM"
		`);
	});

	it("should handle deleting a service", async () => {
		mockWvpcServiceGetUpdateDelete();
		await runWrangler("vpc service delete tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx");

		expect(std.out).toMatchInlineSnapshot(`
			"🗑️  Deleting VPC connectivity service 'tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Deleted VPC connectivity service: tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
		`);
	});

	it("should handle updating a service", async () => {
		const reqProm = mockWvpcServiceUpdate();
		await runWrangler(
			"vpc service update tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx --name test-updated --http-port 80 --ipv4 10.0.0.2 --tunnel-id 550e8400-e29b-41d4-a716-446655440001"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "host": Object {
			    "ipv4": "10.0.0.2",
			    "network": Object {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440001",
			    },
			  },
			  "http_port": 80,
			  "name": "test-updated",
			  "type": "http",
			}
		`);
	});
});

// Mock Data
const mockTcpService: ConnectivityService = {
	service_id: "tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
	type: ServiceType.Tcp,
	name: "test-tcp-service",
	tcp_port: 5432,
	app_protocol: "postgresql",
	host: {
		ipv4: "10.0.0.1",
		network: { tunnel_id: "tunnel-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
	},
	created_at: "2024-01-01T00:00:00Z",
	updated_at: "2024-01-01T00:00:00Z",
};

const mockHttpService: ConnectivityService = {
	service_id: "http-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
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
								service_id: "tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
								type: reqBody.type,
								name: reqBody.name,
								tcp_port: reqBody.tcp_port,
								app_protocol: reqBody.app_protocol,
								http_port: reqBody.http_port,
								https_port: reqBody.https_port,
								host: reqBody.host,
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
								service_id: "tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
								type: reqBody.type,
								name: reqBody.name,
								tcp_port: reqBody.tcp_port,
								app_protocol: reqBody.app_protocol,
								http_port: reqBody.http_port,
								https_port: reqBody.https_port,
								host: reqBody.host,
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
				return HttpResponse.json(createFetchResult(mockTcpService, true));
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
				return HttpResponse.json(
					createFetchResult([mockTcpService, mockHttpService], true)
				);
			},
			{ once: true }
		)
	);
}
