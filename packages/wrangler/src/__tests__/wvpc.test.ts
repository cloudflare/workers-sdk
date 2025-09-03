import { http, HttpResponse } from "msw";
import { vi } from "vitest";
import { ServiceType } from "../wvpc/index";
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
} from "../wvpc/index";

describe("wvpc help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help text when no arguments are passed", async () => {
		await runWrangler("wvpc");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler wvpc

			🌐 Manage WVPC connectivity services [private-beta]

			COMMANDS
			  wrangler wvpc service  🔗 Manage WVPC connectivity services [private-beta]

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
		await runWrangler("wvpc service");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler wvpc service

			🔗 Manage WVPC connectivity services [private-beta]

			COMMANDS
			  wrangler wvpc service create <name>        Create a new WVPC connectivity service [private-beta]
			  wrangler wvpc service delete <service-id>  Delete a WVPC connectivity service [private-beta]
			  wrangler wvpc service get <service-id>     Get a WVPC connectivity service [private-beta]
			  wrangler wvpc service list                 List WVPC connectivity services [private-beta]
			  wrangler wvpc service update <service-id>  Update a WVPC connectivity service [private-beta]

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

describe("wvpc service commands", () => {
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
			"wvpc service create test-tcp --type tcp --tcp-port 5432 --app-protocol postgresql --ipv4 10.0.0.1 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
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
			"👷🏽 'wrangler wvpc ...' commands are currently in private beta. If your account isn't authorized, commands will fail.
			🚧 Creating WVPC connectivity service 'test-tcp'
			✅ Created WVPC connectivity service: tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx
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
			"wvpc service create test-tcp-v6 --type tcp --tcp-port 3306 --app-protocol mysql --ipv6 2001:db8::1 --tunnel-id 550e8400-e29b-41d4-a716-446655440001"
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

	it("should handle creating a TCP service with hostname and resolver network", async () => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"wvpc service create test-hostname --type tcp --tcp-port 5432 --hostname db.example.com --tunnel-id 550e8400-e29b-41d4-a716-446655440002 --resolver-ips 8.8.8.8,8.8.4.4"
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
			  "name": "test-hostname",
			  "tcp_port": 5432,
			  "type": "tcp",
			}
		`);
	});

	// HTTP Service Creation Tests
	it("should handle creating an HTTP service with dual ports", async () => {
		const reqProm = mockWvpcServiceCreate();
		await runWrangler(
			"wvpc service create test-web --type http --http-port 80 --https-port 443 --ipv4 10.0.0.2 --tunnel-id 550e8400-e29b-41d4-a716-446655440003"
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
			"wvpc service create test-https --type http --https-port 8443 --ipv4 10.0.0.3 --tunnel-id 550e8400-e29b-41d4-a716-446655440004"
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
	it("should reject TCP service creation without tcp-port", async () => {
		await expect(() =>
			runWrangler(
				"wvpc service create test-tcp --type tcp --ipv4 10.0.0.1 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mTCP port is required when service type is 'tcp'[0m

			"
		`);
	});

	it("should reject service creation with both IP addresses and hostname", async () => {
		await expect(() =>
			runWrangler(
				"wvpc service create test-invalid --type tcp --tcp-port 5432 --ipv4 10.0.0.1 --hostname example.com --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mCannot specify both IP addresses and hostname. Choose one.[0m

			"
		`);
	});

	it("should reject service creation with hostname but no resolver IPs", async () => {
		await expect(() =>
			runWrangler(
				"wvpc service create test-no-resolvers --type tcp --tcp-port 5432 --hostname example.com --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mResolver IPs are required when using hostname (--resolver-ips)[0m

			"
		`);
	});

	it("should reject service creation with invalid tunnel ID format", async () => {
		await expect(() =>
			runWrangler(
				"wvpc service create test-invalid-tunnel --type tcp --tcp-port 5432 --ipv4 10.0.0.1 --tunnel-id invalid-uuid"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mInvalid tunnel ID format. Must be a valid UUID.[0m

			"
		`);
	});

	it("should reject TCP service creation with HTTP-specific arguments", async () => {
		await expect(() =>
			runWrangler(
				"wvpc service create test-mixed --type tcp --tcp-port 5432 --https-port 443 --http-port 80 --ipv4 10.0.0.1 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mHTTP/HTTPS ports are not valid for TCP services[0m

			"
		`);
	});

	it("should reject service creation with invalid IPv4 format", async () => {
		await expect(() =>
			runWrangler(
				"wvpc service create test-invalid-ip --type tcp --tcp-port 5432 --ipv4 999.999.999.999 --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
			)
		).rejects.toThrow();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mInvalid IPv4 address format: 999.999.999.999[0m

			"
		`);
	});

	it("should handle listing services", async () => {
		mockWvpcServiceList();
		await runWrangler("wvpc service list");

		expect(std.out).toMatchInlineSnapshot(`
			"👷🏽 'wrangler wvpc ...' commands are currently in private beta. If your account isn't authorized, commands will fail.
			📋 Listing WVPC connectivity services
			┌─┬─┬─┬─┬─┬─┬─┬─┐
			│ id │ name │ type │ ports │ host │ tunnel │ created │ modified │
			├─┼─┼─┼─┼─┼─┼─┼─┤
			│ tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx │ test-tcp-service │ tcp │ 5432 (postgresql) │ 10.0.0.1 │ tunnel-x... │ 1/1/2024, 12:00:00 AM │ 1/1/2024, 12:00:00 AM │
			├─┼─┼─┼─┼─┼─┼─┼─┤
			│ http-xxxx-xxxx-xxxx-xxxxxxxxxxxx │ test-web-service │ http │ HTTP:80, HTTPS:443 │ web.example.com │ tunnel-y... │ 1/1/2024, 12:00:00 AM │ 1/1/2024, 12:00:00 AM │
			└─┴─┴─┴─┴─┴─┴─┴─┘"
		`);
	});

	it("should handle listing services with type filter", async () => {
		mockWvpcServiceList();
		await runWrangler("wvpc service list --service-type tcp");

		expect(std.out).toContain("📋 Listing WVPC connectivity services");
	});

	it("should handle getting a service", async () => {
		mockWvpcServiceGetUpdateDelete();
		await runWrangler("wvpc service get tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx");

		expect(std.out).toMatchInlineSnapshot(`
			"👷🏽 'wrangler wvpc ...' commands are currently in private beta. If your account isn't authorized, commands will fail.
			🔍 Getting WVPC connectivity service 'tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Retrieved WVPC connectivity service: tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx
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
		await runWrangler("wvpc service delete tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx");

		expect(std.out).toMatchInlineSnapshot(`
			"👷🏽 'wrangler wvpc ...' commands are currently in private beta. If your account isn't authorized, commands will fail.
			🗑️  Deleting WVPC connectivity service 'tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
			✅ Deleted WVPC connectivity service: tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
		`);
	});

	it("should handle updating a service", async () => {
		const reqProm = mockWvpcServiceUpdate();
		await runWrangler(
			"wvpc service update tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx --name test-updated --type tcp --tcp-port 5433 --ipv4 10.0.0.2 --tunnel-id 550e8400-e29b-41d4-a716-446655440001"
		);

		await expect(reqProm).resolves.toMatchInlineSnapshot(`
			Object {
			  "host": Object {
			    "ipv4": "10.0.0.2",
			    "network": Object {
			      "tunnel_id": "550e8400-e29b-41d4-a716-446655440001",
			    },
			  },
			  "name": "test-updated",
			  "tcp_port": 5433,
			  "type": "tcp",
			}
		`);
	});
});

// Mock Data
const mockTcpService: ConnectivityService = {
	service_id: "tcp-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
	service_config: {
		type: ServiceType.Tcp,
		name: "test-tcp-service",
		tcp_port: 5432,
		app_protocol: "postgresql",
	},
	host: {
		ipv4: "10.0.0.1",
		network: { tunnel_id: "tunnel-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
	},
	created_at: "2024-01-01T00:00:00Z",
	updated_at: "2024-01-01T00:00:00Z",
};

const mockHttpService: ConnectivityService = {
	service_id: "http-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
	service_config: {
		type: ServiceType.Http,
		name: "test-web-service",
		http_port: 80,
		https_port: 443,
	},
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
								service_config: {
									type: reqBody.type,
									name: reqBody.name,
									tcp_port: reqBody.tcp_port,
									app_protocol: reqBody.app_protocol,
									http_port: reqBody.http_port,
									https_port: reqBody.https_port,
								},
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
								service_config: {
									type: reqBody.type,
									name: reqBody.name,
									tcp_port: reqBody.tcp_port,
									app_protocol: reqBody.app_protocol,
									http_port: reqBody.http_port,
									https_port: reqBody.https_port,
								},
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
