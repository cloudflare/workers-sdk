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
	type = ServiceType.Tcp
) {
	return `vpc service ${operation} ${operation === "create" ? "database" : "service-uuid --name database"} --type ${type} --${type === ServiceType.Tcp ? "tcp" : "https"}-port ${port} --tunnel-id ${tunnelId} ${hostname ? "--hostname db.example.com --resolver-ips 10.0.0.53" : "--ipv4 10.0.0.1"}`;
}

/** Simulate the replacement API: each write replaces the saved service. */
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
			"--remove-certificate-authority",
			"--remove-client-certificate",
		])(
			"rejects unsupported TLS flags rather than silently ignoring them: %s",
			async (flags, { expect }) => {
				const requests = rejectAllApiCalls();
				await expect(
					runWrangler(`${command(operation)} ${flags}`)
				).rejects.toThrow(/Unknown argument/);
				expect(requests).not.toHaveBeenCalled();
			}
		);
	});

	const tlsCases = [
		["no TLS options", "", undefined],
		[
			"mode-only verify_full",
			"--cert-verification-mode verify_full",
			{ cert_verification_mode: "verify_full" },
		],
		[
			"mode-only disabled",
			"--cert-verification-mode disabled",
			{ cert_verification_mode: "disabled" },
		],
		[
			"a custom CA",
			`--certificate-authority ${caId} --cert-verification-mode verify_full`,
			{ certificate_authority: caId, cert_verification_mode: "verify_full" },
		],
		[
			"a client certificate with verification disabled",
			`--client-certificate ${clientId} --cert-verification-mode disabled`,
			{ client_certificate: clientId, cert_verification_mode: "disabled" },
		],
		[
			"both certificates",
			`--certificate-authority ${caId} --client-certificate ${clientId} --cert-verification-mode verify_ca`,
			serviceTls,
		],
	] as const;

	describe.each([ServiceType.Tcp, ServiceType.Http])("%s services", (type) => {
		it.for(tlsCases)(
			"creates a service with %s",
			async ([_label, flags, tls], { expect }) => {
				const api = savedService(fixture(false, type));
				await runWrangler(`${command("create", false, 443, type)} ${flags}`);
				expect(api.calls).toEqual(["POST"]);
				expect(api.writes[0].tls_settings).toEqual(tls);
			}
		);
	});

	it.for(tlsCases)(
		"replaces the service TLS settings with %s in a single PUT",
		async ([_label, flags, tls], { expect }) => {
			const api = savedService();
			await runWrangler(`${command("update")} ${flags}`);
			expect(api.calls).toEqual(["PUT"]);
			expect(api.writes[0].tls_settings).toEqual(tls);
			expect(api.current().tls_settings).toEqual(tls);
		}
	);

	it.for([false, true])(
		"reports configured service TLS without private data (hostname=%s)",
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

	it.for([
		["disabled", "None"],
		["verify_ca", "None (system trust store)"],
		["verify_full", "None (system trust store)"],
	] as const)(
		"reports the default certificate authority for %s verification",
		async ([mode, authority], { expect }) => {
			const service = fixture();
			service.tls_settings = { cert_verification_mode: mode };
			savedService(service);
			await runWrangler("vpc service get service-uuid");
			expect(std.out).toContain(`Certificate Authority: ${authority}\n`);
		}
	);

	it.for(["create", "update"] as const)(
		"surfaces certificate API errors on %s without reporting success",
		async (operation, { expect }) => {
			const writes: ConnectivityServiceRequest[] = [];
			const failure = HttpResponse.json(
				{
					success: false,
					errors: [{ code: 1000, message: "Certificate not found" }],
					messages: [],
					result: null,
				},
				{ status: 400 }
			);
			msw.use(
				http.post(servicesUrl, async ({ request }) => {
					writes.push((await request.json()) as ConnectivityServiceRequest);
					return failure;
				}),
				http.put(serviceUrl, async ({ request }) => {
					writes.push((await request.json()) as ConnectivityServiceRequest);
					return failure;
				})
			);
			await expect(
				runWrangler(
					`${command(operation)} --certificate-authority ${caId} --cert-verification-mode verify_ca`
				)
			).rejects.toThrow();
			expect(writes).toHaveLength(1);
			expect(std.out).not.toContain("Created VPC service");
			expect(std.out).not.toContain("Updated VPC service");
		}
	);
});
