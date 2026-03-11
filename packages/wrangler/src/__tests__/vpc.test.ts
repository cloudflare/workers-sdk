import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- helper functions with expect */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { ServiceType } from "../vpc/index";
import { validateHostname, validateRequest } from "../vpc/validation";
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
import type { ServiceArgs } from "../vpc/validation";

describe("vpc help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help text when no arguments are passed", async () => {
		await runWrangler("vpc");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler vpc

			🌐 Manage VPC [open beta]

			COMMANDS
			  wrangler vpc service  🔗 Manage VPC services

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

	it("should handle creating an HTTP service with IPv4", async () => {
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

	it("should handle creating a service with hostname and resolver network", async () => {
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

	it("should reject service creation with both IP addresses and hostname", async () => {
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

	it("should handle listing services", async () => {
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

	it("should handle getting a service", async () => {
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

	it("should handle deleting a service", async () => {
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

	it("should handle updating a service", async () => {
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

	it("should handle getting a service without resolver_ips", async () => {
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

	it("should handle creating a service and display without resolver_ips", async () => {
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
});

describe("hostname validation", () => {
	it("should accept valid hostnames", () => {
		expect(() => validateHostname("api.example.com")).not.toThrow();
		expect(() => validateHostname("localhost")).not.toThrow();
		expect(() => validateHostname("my-service.internal.local")).not.toThrow();
		expect(() => validateHostname("sub.domain.example.co.uk")).not.toThrow();
	});

	it("should reject empty hostname", () => {
		expect(() => validateHostname("")).toThrow("Hostname cannot be empty.");
		expect(() => validateHostname("   ")).toThrow("Hostname cannot be empty.");
	});

	it("should reject hostname exceeding 253 characters", () => {
		const longHostname = "a".repeat(254);
		expect(() => validateHostname(longHostname)).toThrow(
			"Hostname is too long. Maximum length is 253 characters."
		);
	});

	it("should accept hostname at exactly 253 characters", () => {
		const label = "a".repeat(63);
		const hostname = `${label}.${label}.${label}.${label.slice(0, 61)}`;
		expect(hostname.length).toBe(253);
		expect(() => validateHostname(hostname)).not.toThrow();
	});

	it("should reject hostname with URL scheme", () => {
		expect(() => validateHostname("https://example.com")).toThrow(
			"Hostname must not include a URL scheme"
		);
		expect(() => validateHostname("http://example.com")).toThrow(
			"Hostname must not include a URL scheme"
		);
	});

	it("should reject hostname with path", () => {
		expect(() => validateHostname("example.com/path")).toThrow(
			"Hostname must not include a path"
		);
	});

	it("should reject bare IPv4 address", () => {
		expect(() => validateHostname("192.168.1.1")).toThrow(
			"Hostname must not be an IP address. Use --ipv4 or --ipv6 instead."
		);
		expect(() => validateHostname("10.0.0.1")).toThrow(
			"Hostname must not be an IP address"
		);
	});

	it("should reject bare IPv6 address", () => {
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

	it("should reject hostname with port", () => {
		expect(() => validateHostname("example.com:8080")).toThrow(
			"Hostname must not include a port number"
		);
	});

	it("should reject hostname with whitespace", () => {
		expect(() => validateHostname("bad host.com")).toThrow(
			"Hostname must not contain whitespace"
		);
	});

	it("should accept hostnames with underscores", () => {
		expect(() => validateHostname("_dmarc.example.com")).not.toThrow();
		expect(() => validateHostname("my_service.internal")).not.toThrow();
	});

	it("should report all applicable errors at once", () => {
		// "https://example.com/path" has a scheme AND a path
		expect(() => validateHostname("https://example.com/path")).toThrow(
			/URL scheme.*\n.*path/s
		);
	});

	it("should reject invalid hostname via wrangler service create", async () => {
		await expect(() =>
			runWrangler(
				"vpc service create test-bad-hostname --type http --hostname https://example.com --tunnel-id 550e8400-e29b-41d4-a716-446655440000"
			)
		).rejects.toThrow("Hostname must not include a URL scheme");
	});

	it("should reject IP address as hostname via wrangler service create", async () => {
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

	it("should accept valid IPv4 addresses", () => {
		expect(() =>
			validateRequest({ ...baseArgs, ipv4: "192.168.1.1" })
		).not.toThrow();
		expect(() =>
			validateRequest({ ...baseArgs, ipv4: "10.0.0.1" })
		).not.toThrow();
	});

	it("should reject invalid IPv4 addresses", () => {
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

	it("should accept valid IPv6 addresses", () => {
		expect(() => validateRequest({ ...baseArgs, ipv6: "::1" })).not.toThrow();
		expect(() =>
			validateRequest({ ...baseArgs, ipv6: "2001:db8::1" })
		).not.toThrow();
	});

	it("should reject invalid IPv6 addresses", () => {
		expect(() => validateRequest({ ...baseArgs, ipv6: "not-an-ip" })).toThrow(
			"Invalid IPv6 address"
		);
		expect(() => validateRequest({ ...baseArgs, ipv6: "192.168.1.1" })).toThrow(
			"Invalid IPv6 address"
		);
	});

	it("should accept valid resolver IPs", () => {
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

	it("should reject invalid resolver IPs", () => {
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
