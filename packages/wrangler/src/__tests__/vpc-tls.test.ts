import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it, vi } from "vitest";
import { ServiceType } from "../vpc/index";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { createFetchResult, msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";
import type {
	ConnectivityService,
	ConnectivityServiceRequest,
	TlsSettings,
} from "../vpc/index";

const servicesUrl = "*/accounts/:accountId/connectivity/directory/services";
const serviceUrl = `${servicesUrl}/:serviceId`;
const tunnelId = "550e8400-e29b-41d4-a716-446655440000";
const caId = "550e8400-e29b-41d4-a716-446655440001";
const clientId = "550e8400-e29b-41d4-a716-446655440002";
const replacementId = "550e8400-e29b-41d4-a716-446655440005";
const serviceTls: TlsSettings = {
	certificate_authority: caId,
	client_certificate: clientId,
	cert_verification_mode: "verify_ca",
};

function fixture(
	hostname = false,
	type = ServiceType.Tcp
): ConnectivityService {
	return {
		service_id: "service-uuid",
		name: "database",
		type,
		...(type === ServiceType.Tcp ? { tcp_port: 5432 } : { https_port: 443 }),
		host: hostname
			? {
					hostname: "db.example.com",
					resolver_network: {
						tunnel_id: tunnelId,
						resolver_ips: ["10.0.0.53"],
					},
				}
			: {
					ipv4: "10.0.0.1",
					network: {
						tunnel_id: tunnelId,
					},
				},
		tls_settings: { ...serviceTls },
		created_at: "2024-01-01T00:00:00Z",
		updated_at: "2024-01-01T00:00:00Z",
	};
}

function command(
	operation: "create" | "update",
	hostname = false,
	port = 5432,
	type = ServiceType.Tcp,
	tunnel = tunnelId
) {
	return `vpc service ${operation} ${operation === "create" ? "database" : "service-uuid --name database"} --type ${type} --${type === ServiceType.Tcp ? "tcp" : "https"}-port ${port} --tunnel-id ${tunnel} ${hostname ? "--hostname db.example.com --resolver-ips 10.0.0.53" : "--ipv4 10.0.0.1"}`;
}

/** Simulate the replacement API, keeping GET state separate from CLI arguments. */
function savedService(initial = fixture()) {
	let saved = initial;
	const calls: string[] = [];
	const writes: ConnectivityServiceRequest[] = [];
	function replace(body: ConnectivityServiceRequest) {
		writes.push(body);
		saved = {
			...body,
			service_id: initial.service_id,
			created_at: initial.created_at,
			updated_at: "2024-01-02T00:00:00Z",
		};
		return HttpResponse.json(createFetchResult(saved, true));
	}
	msw.use(
		http.post(servicesUrl, async ({ request }) => {
			calls.push("POST");
			return replace((await request.json()) as ConnectivityServiceRequest);
		}),
		http.get(serviceUrl, () => {
			calls.push("GET");
			return HttpResponse.json(createFetchResult(saved, true));
		}),
		http.put(serviceUrl, async ({ request }) => {
			calls.push("PUT");
			return replace((await request.json()) as ConnectivityServiceRequest);
		})
	);
	return { calls, writes, current: () => saved };
}

function rejectAllApiCalls() {
	const requests = vi.fn(() =>
		HttpResponse.json(createFetchResult(null, false), { status: 500 })
	);
	msw.use(http.all("*", requests));
	return requests;
}

describe("VPC TLS configuration", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = mockConsoleMethods();

	beforeEach(() => {
		// Avoid the command banner's artificial delay.
		// @ts-expect-error this mock only needs to schedule the callback
		vi.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
			setImmediate(fn);
		});
	});

	describe.each(["create", "update"] as const)("%s validation", (operation) => {
		it.for([
			["certificate-authority", caId],
			["client-certificate", clientId],
		])(
			"requires an explicit mode for --%s before any API call",
			async ([flag, id], { expect }) => {
				if (operation === "update") {
					// A saved verification mode must not satisfy an omitted CLI mode.
					savedService();
				}
				const requests = rejectAllApiCalls();
				await expect(
					runWrangler(`${command(operation)} --${flag} ${id}`)
				).rejects.toThrow(
					"--cert-verification-mode is required when providing --certificate-authority or --client-certificate. Choose verify_full, verify_ca, or disabled."
				);
				expect(requests).not.toHaveBeenCalled();
			}
		);

		it.for(["certificate-authority", "client-certificate"])(
			"rejects invalid --%s UUIDs before any API call",
			async (flag, { expect }) => {
				const requests = rejectAllApiCalls();
				await expect(
					runWrangler(
						`${command(operation)} --${flag} not-a-uuid --cert-verification-mode verify_ca`
					)
				).rejects.toThrow();
				expect(requests).not.toHaveBeenCalled();
				expect(std.err).toContain(flag);
			}
		);

		it("rejects an invalid verification mode before any API call", async ({
			expect,
		}) => {
			const requests = rejectAllApiCalls();
			await expect(
				runWrangler(`${command(operation)} --cert-verification-mode not-a-mode`)
			).rejects.toThrow();
			expect(requests).not.toHaveBeenCalled();
			expect(std.err).toContain("cert-verification-mode");
		});

		it("rejects a CA with disabled verification before any API call", async ({
			expect,
		}) => {
			const requests = rejectAllApiCalls();
			await expect(
				runWrangler(
					`${command(operation)} --certificate-authority ${caId} --cert-verification-mode disabled`
				)
			).rejects.toThrow(/certificate.authority/i);
			expect(requests).not.toHaveBeenCalled();
			expect(std.out).not.toContain("Created VPC service");
			expect(std.out).not.toContain("Updated VPC service");
		});

		it.for([
			`--network-certificate-authority ${caId}`,
			`--network-client-certificate ${clientId}`,
			"--network-cert-verification-mode verify_ca",
			"--remove-network-certificate-authority",
			"--remove-network-client-certificate",
			"--remove-network-tls-settings",
			"--use-network-tls-settings",
		])(
			"rejects removed network TLS flags rather than silently ignoring them: %s",
			async (flags, { expect }) => {
				const requests = rejectAllApiCalls();
				await expect(
					runWrangler(`${command(operation)} ${flags}`)
				).rejects.toThrow(/Unknown argument/);
				expect(requests).not.toHaveBeenCalled();
			}
		);
	});

	it.for([
		`--certificate-authority ${caId} --cert-verification-mode verify_ca --remove-certificate-authority`,
		`--client-certificate ${clientId} --cert-verification-mode verify_ca --remove-client-certificate`,
	])(
		"rejects conflicting update flags before any API call: %s",
		async (flags, { expect }) => {
			const requests = rejectAllApiCalls();
			await expect(
				runWrangler(`${command("update")} ${flags}`)
			).rejects.toThrow();
			expect(requests).not.toHaveBeenCalled();
		}
	);

	it.for(["remove-certificate-authority", "remove-client-certificate"])(
		"rejects update-only --%s on create before any API call",
		async (flag, { expect }) => {
			const requests = rejectAllApiCalls();
			await expect(
				runWrangler(`${command("create")} --${flag}`)
			).rejects.toThrow(/Unknown argument/);
			expect(requests).not.toHaveBeenCalled();
		}
	);

	describe.each([ServiceType.Tcp, ServiceType.Http])("%s services", (type) => {
		it.for([
			[
				"explicit full verification",
				"",
				{ cert_verification_mode: "verify_full" },
			],
			[
				"chain-only verification without custom certificates",
				"",
				{ cert_verification_mode: "verify_ca" },
			],
			[
				"disabled verification without custom certificates",
				"",
				{ cert_verification_mode: "disabled" },
			],
			[
				"client authentication with verification disabled",
				`--client-certificate ${clientId}`,
				{ client_certificate: clientId, cert_verification_mode: "disabled" },
			],
		] as const)(
			"retains %s through creation and an unrelated replacement update",
			async ([_label, flags, tls], { expect }) => {
				const api = savedService(fixture(false, type));
				await runWrangler(
					`${command("create", false, 443, type)} ${flags} --cert-verification-mode ${tls.cert_verification_mode}`
				);
				expect(api.current().tls_settings).toEqual(tls);
				await runWrangler(command("update", false, 8443, type));
				expect(api.calls).toEqual(["POST", "GET", "PUT"]);
				expect(api.current().tls_settings).toEqual(tls);
			}
		);
	});

	it.for([false, true])(
		"retains configured service TLS on unrelated edits (hostname=%s)",
		async (hostname, { expect }) => {
			const api = savedService(fixture(hostname));
			await runWrangler(command("update", hostname, 5433));
			expect(api.calls).toEqual(["GET", "PUT"]);
			expect(api.current().tcp_port).toBe(5433);
			expect(api.current().tls_settings).toEqual(serviceTls);
		}
	);

	it.for([false, true])(
		"keeps omitted service TLS omitted on unrelated edits (hostname=%s)",
		async (hostname, { expect }) => {
			const initial = fixture(hostname);
			delete initial.tls_settings;
			const api = savedService(initial);
			await runWrangler(command("update", hostname, 5433));
			expect(api.calls).toEqual(["GET", "PUT"]);
			expect(api.current().tls_settings).toBeUndefined();
		}
	);

	it.for([false, true])(
		"retains service TLS when switching host kind and tunnel (hostname=%s)",
		async (hostname, { expect }) => {
			const api = savedService(fixture(hostname));
			await runWrangler(
				command("update", !hostname, 5432, ServiceType.Tcp, replacementId)
			);
			expect(api.calls).toEqual(["GET", "PUT"]);
			expect(api.current().tls_settings).toEqual(serviceTls);
			expect(api.current().host).toEqual(
				hostname
					? { ipv4: "10.0.0.1", network: { tunnel_id: replacementId } }
					: {
							hostname: "db.example.com",
							resolver_network: {
								tunnel_id: replacementId,
								resolver_ips: ["10.0.0.53"],
							},
						}
			);
		}
	);

	it.for([
		["certificate-authority", "certificate_authority"],
		["client-certificate", "client_certificate"],
	] as const)(
		"rotates only --%s while retaining the other ref",
		async ([flag, key], { expect }) => {
			const api = savedService();
			await runWrangler(
				`${command("update")} --${flag} ${replacementId} --cert-verification-mode verify_ca`
			);
			expect(api.calls).toEqual(["GET", "PUT"]);
			expect(api.current().tls_settings).toEqual({
				...serviceTls,
				[key]: replacementId,
			});
		}
	);

	it.for([
		[
			"remove-certificate-authority",
			{ client_certificate: clientId, cert_verification_mode: "verify_ca" },
		],
		[
			"remove-client-certificate",
			{ certificate_authority: caId, cert_verification_mode: "verify_ca" },
		],
	] as const)(
		"removes only --%s without requiring a mode",
		async ([flag, expected], { expect }) => {
			const api = savedService();
			await runWrangler(`${command("update")} --${flag}`);
			expect(api.calls).toEqual(["GET", "PUT"]);
			expect(api.current().tls_settings).toEqual(expected);
		}
	);

	it("retains both certificate references on a service mode-only edit", async ({
		expect,
	}) => {
		const api = savedService();
		await runWrangler(
			`${command("update")} --cert-verification-mode verify_full`
		);
		expect(api.current().tls_settings).toEqual({
			...serviceTls,
			cert_verification_mode: "verify_full",
		});
	});

	it("can remove both service references without clearing its non-default mode", async ({
		expect,
	}) => {
		const api = savedService();
		await runWrangler(
			`${command("update")} --remove-certificate-authority --remove-client-certificate`
		);
		expect(api.current().tls_settings).toEqual({
			cert_verification_mode: "verify_ca",
		});
	});

	it.for([
		["CA", `--certificate-authority ${caId}`, { certificate_authority: caId }],
		[
			"client",
			`--client-certificate ${clientId}`,
			{ client_certificate: clientId },
		],
		[
			"both",
			`--certificate-authority ${caId} --client-certificate ${clientId}`,
			{ certificate_authority: caId, client_certificate: clientId },
		],
	] as const)(
		"adds %s TLS configuration to a preexisting service",
		async ([_label, flags, refs], { expect }) => {
			const initial = fixture();
			delete initial.tls_settings;
			const api = savedService(initial);
			await runWrangler(
				`${command("update")} ${flags} --cert-verification-mode verify_ca`
			);
			expect(api.calls).toEqual(["GET", "PUT"]);
			expect(api.current().tls_settings).toEqual({
				...refs,
				cert_verification_mode: "verify_ca",
			});
		}
	);

	it.for(["verify_full", "verify_ca", "disabled"] as const)(
		"sets explicit mode-only %s on a service without TLS references",
		async (mode, { expect }) => {
			const initial = fixture();
			delete initial.tls_settings;
			const api = savedService(initial);
			await runWrangler(
				`${command("update")} --cert-verification-mode ${mode}`
			);
			expect(api.calls).toEqual(["GET", "PUT"]);
			expect(api.current().tls_settings).toEqual({
				cert_verification_mode: mode,
			});
		}
	);

	it.for([
		"--cert-verification-mode disabled",
		`--client-certificate ${replacementId} --cert-verification-mode disabled`,
	])(
		"rejects disabling verification with a retained CA after GET and before PUT: %s",
		async (flags, { expect }) => {
			const api = savedService();
			await expect(
				runWrangler(`${command("update")} ${flags}`)
			).rejects.toThrow(/certificate.authority/i);
			expect(api.calls).toEqual(["GET"]);
			expect(api.writes).toHaveLength(0);
			expect(api.current().tls_settings).toEqual(serviceTls);
			expect(std.out).not.toContain("Updated VPC service");
		}
	);

	it("allows disabling verification when removing the CA and preserves the client", async ({
		expect,
	}) => {
		const api = savedService();
		await runWrangler(
			`${command("update")} --remove-certificate-authority --cert-verification-mode disabled`
		);
		expect(api.calls).toEqual(["GET", "PUT"]);
		expect(api.current().tls_settings).toEqual({
			client_certificate: clientId,
			cert_verification_mode: "disabled",
		});
	});

	it("adds a client certificate with disabled verification to an existing service", async ({
		expect,
	}) => {
		const initial = fixture();
		delete initial.tls_settings;
		const api = savedService(initial);
		await runWrangler(
			`${command("update")} --client-certificate ${clientId} --cert-verification-mode disabled`
		);
		expect(api.calls).toEqual(["GET", "PUT"]);
		expect(api.current().tls_settings).toEqual({
			client_certificate: clientId,
			cert_verification_mode: "disabled",
		});
	});

	it.for([false, true])(
		"reports configured service TLS without network sources or private data (hostname=%s)",
		async (hostname, { expect }) => {
			const service = {
				...fixture(hostname),
				internal_id: "internal-secret-marker",
				private_key: "private-key-marker",
				certificate: "certificate-pem-marker",
			};
			msw.use(
				http.get(serviceUrl, () =>
					HttpResponse.json(createFetchResult(service, true))
				)
			);
			await runWrangler("vpc service get service-uuid");
			expect(std.out).not.toContain("TLS Source:");
			expect(std.out).not.toContain("Network TLS Settings:");
			for (const id of [caId, clientId]) {
				expect(std.out).toContain(id);
			}
			expect(std.out).toContain("verify_ca");
			for (const secret of [
				"internal-secret-marker",
				"private-key-marker",
				"certificate-pem-marker",
			]) {
				expect(std.out).not.toContain(secret);
			}
		}
	);

	it.for([false, true])(
		"does not turn GET or PUT API errors into update success (GET fails=%s)",
		async (getFails, { expect }) => {
			const calls: string[] = [];
			const failure = {
				success: false,
				errors: [{ code: 1000, message: "TLS configuration rejected" }],
				messages: [],
				result: null,
			};
			msw.use(
				http.get(serviceUrl, () => {
					calls.push("GET");
					return getFails
						? HttpResponse.json(failure, { status: 400 })
						: HttpResponse.json(createFetchResult(fixture(), true));
				}),
				http.put(serviceUrl, () => {
					calls.push("PUT");
					return HttpResponse.json(failure, { status: 400 });
				})
			);
			await expect(
				runWrangler(
					`${command("update")} --certificate-authority ${replacementId} --cert-verification-mode verify_ca`
				)
			).rejects.toThrow();
			expect(calls).toEqual(getFails ? ["GET"] : ["GET", "PUT"]);
			expect(std.out).not.toContain("Updated VPC service");
		}
	);

	it("surfaces certificate API errors on create without success", async ({
		expect,
	}) => {
		const writes: ConnectivityServiceRequest[] = [];
		msw.use(
			http.post(servicesUrl, async ({ request }) => {
				writes.push((await request.json()) as ConnectivityServiceRequest);
				return HttpResponse.json(
					{
						success: false,
						errors: [{ code: 1000, message: "Certificate not found" }],
						messages: [],
						result: null,
					},
					{ status: 400 }
				);
			})
		);
		await expect(
			runWrangler(
				`${command("create")} --certificate-authority ${caId} --cert-verification-mode verify_ca`
			)
		).rejects.toThrow();
		expect(writes).toHaveLength(1);
		expect(std.out).not.toContain("Created VPC service");
	});

	it.for([
		["remove-certificate-authority", { certificate_authority: caId }],
		["remove-client-certificate", { client_certificate: clientId }],
	] as const)(
		"retains explicit verify_full after removing the final reference with --%s",
		async ([flag, ref], { expect }) => {
			const initial = fixture();
			initial.tls_settings = {
				...ref,
				cert_verification_mode: "verify_full",
			};
			const api = savedService(initial);
			await runWrangler(`${command("update")} --${flag}`);
			expect(api.current().tls_settings).toEqual({
				cert_verification_mode: "verify_full",
			});
			await runWrangler(command("update", false, 5433));
			expect(api.calls).toEqual(["GET", "PUT", "GET", "PUT"]);
			expect(api.current().tls_settings).toEqual({
				cert_verification_mode: "verify_full",
			});
		}
	);

	it.for(["create", "update"] as const)(
		"surfaces employee-rollout 403 errors on %s without reporting success",
		async (operation, { expect }) => {
			const calls: string[] = [];
			const failure = {
				success: false,
				errors: [
					{
						code: 1000,
						message: "Custom certificates require a Cloudflare employee actor",
					},
				],
				messages: [],
				result: null,
			};
			msw.use(
				http.get(serviceUrl, () => {
					calls.push("GET");
					return HttpResponse.json(createFetchResult(fixture(), true));
				}),
				http.post(servicesUrl, () => {
					calls.push("POST");
					return HttpResponse.json(failure, { status: 403 });
				}),
				http.put(serviceUrl, () => {
					calls.push("PUT");
					return HttpResponse.json(failure, { status: 403 });
				})
			);
			await expect(
				runWrangler(
					`${command(operation)} --client-certificate ${clientId} --cert-verification-mode verify_full`
				)
			).rejects.toThrow();
			expect(calls).toEqual(operation === "create" ? ["POST"] : ["GET", "PUT"]);
			expect(std.out).not.toContain("Created VPC service");
			expect(std.out).not.toContain("Updated VPC service");
		}
	);
});
