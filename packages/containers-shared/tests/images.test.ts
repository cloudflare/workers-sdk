import { beforeEach, describe, it, vi } from "vitest";
import { ExternalRegistryKind } from "../src/client/models/ExternalRegistryKind";
import {
	getEgressInterceptorPlatform,
	pullEgressInterceptorImage,
	getAndValidateRegistryType,
	validateAndEncodeGarKey,
} from "../src/images";
import { runDockerCmd } from "../src/utils";

vi.mock("../src/utils", () => ({
	runDockerCmd: vi.fn(() => ({
		abort: vi.fn(),
		ready: Promise.resolve({ aborted: false }),
		then: (resolve: () => void) => {
			resolve();
		},
	})),
}));

describe("getEgressInterceptorPlatform", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	it("does not force a platform by default", ({ expect }) => {
		expect(getEgressInterceptorPlatform()).toBeUndefined();
	});

	it("allows overriding the platform", ({ expect }) => {
		vi.stubEnv("MINIFLARE_CONTAINER_EGRESS_IMAGE_PLATFORM", "linux/s390x");

		expect(getEgressInterceptorPlatform()).toBe("linux/s390x");
	});
});

describe("pullEgressInterceptorImage", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		vi.mocked(runDockerCmd).mockClear();
	});

	it("pulls the egress interceptor image without forcing a platform by default", async ({
		expect,
	}) => {
		vi.stubEnv("MINIFLARE_CONTAINER_EGRESS_IMAGE", "proxy-everything:test");

		await pullEgressInterceptorImage("docker");

		expect(runDockerCmd).toHaveBeenCalledWith("docker", [
			"pull",
			"proxy-everything:test",
		]);
	});

	it("pulls the egress interceptor image for the configured platform", async ({
		expect,
	}) => {
		vi.stubEnv("MINIFLARE_CONTAINER_EGRESS_IMAGE", "proxy-everything:test");
		vi.stubEnv("MINIFLARE_CONTAINER_EGRESS_IMAGE_PLATFORM", "linux/arm64");

		await pullEgressInterceptorImage("docker");

		expect(runDockerCmd).toHaveBeenCalledWith("docker", [
			"pull",
			"proxy-everything:test",
			"--platform",
			"linux/arm64",
		]);
	});
});

const garDomain = "us-central1-docker.pkg.dev";
const clientEmail = "wrangler-test@test-project.iam.gserviceaccount.com";
const serviceAccountKey = JSON.stringify({
	type: "service_account",
	project_id: "test-project",
	private_key_id: "test-key-id",
	private_key: "fake-private-key",
	client_email: clientEmail,
	client_id: "123456789",
});

describe("getAndValidateRegistryType - GAR", () => {
	it("recognizes a *-docker.pkg.dev domain as GAR", ({ expect }) => {
		const gar = getAndValidateRegistryType(garDomain);
		expect(gar.type).toBe(ExternalRegistryKind.GAR);
		expect(gar.name).toBe("Google Artifact Registry");
		expect(gar.secretType).toBe("Google Service Account JSON Key");
	});

	const validGarDomains = [
		"us-docker.pkg.dev",
		"us-central1-docker.pkg.dev",
		"europe-west1-docker.pkg.dev",
		"asia-docker.pkg.dev",
		"northamerica-northeast1-docker.pkg.dev",
		"a-docker.pkg.dev",
	];
	for (const domain of validGarDomains) {
		it(`recognizes ${domain} as GAR`, ({ expect }) => {
			expect(getAndValidateRegistryType(domain).type).toBe(
				ExternalRegistryKind.GAR
			);
		});
	}

	const invalidGarDomains = [
		"gcr.io",
		"us.gcr.io",
		"docker.pkg.dev", // missing the `<location>-` prefix
		"us-central1.docker.pkg.dev", // dot instead of hyphen before docker
		"foo.bar-docker.pkg.dev", // dotted prefix is not a single location label
		"us-central1-docker.pkg.dev.evil.com", // trailing suffix (anchored regex)
		"us-central1-docker.pkg.deviant", // wrong TLD-like suffix
	];
	for (const domain of invalidGarDomains) {
		it(`rejects ${domain}`, ({ expect }) => {
			expect(() => getAndValidateRegistryType(domain)).toThrow(
				`${domain} is not a supported image registry`
			);
		});
	}

	it("does not treat ECR or DockerHub domains as GAR", ({ expect }) => {
		expect(
			getAndValidateRegistryType("123456789012.dkr.ecr.us-west-2.amazonaws.com")
				.type
		).toBe(ExternalRegistryKind.ECR);
		expect(getAndValidateRegistryType("docker.io").type).toBe(
			ExternalRegistryKind.DOCKER_HUB
		);
	});
});

describe("validateAndEncodeGarKey", () => {
	it("base64-encodes a raw JSON key when the email matches", ({ expect }) => {
		expect(validateAndEncodeGarKey(serviceAccountKey, clientEmail)).toBe(
			Buffer.from(serviceAccountKey, "utf8").toString("base64")
		);
	});

	it("trims surrounding whitespace before encoding", ({ expect }) => {
		expect(
			validateAndEncodeGarKey(`\n  ${serviceAccountKey}  \n`, clientEmail)
		).toBe(Buffer.from(serviceAccountKey, "utf8").toString("base64"));
	});

	it("passes through an already base64-encoded key unchanged", ({ expect }) => {
		const base64Key = Buffer.from(serviceAccountKey, "utf8").toString("base64");
		expect(validateAndEncodeGarKey(base64Key, clientEmail)).toBe(base64Key);
	});

	it("accepts a key that is missing the optional private_key_id", ({
		expect,
	}) => {
		const keyWithoutPrivateKeyId = JSON.stringify({
			type: "service_account",
			project_id: "test-project",
			private_key: "fake-private-key",
			client_email: clientEmail,
			client_id: "123456789",
		});

		expect(validateAndEncodeGarKey(keyWithoutPrivateKeyId, clientEmail)).toBe(
			Buffer.from(keyWithoutPrivateKeyId, "utf8").toString("base64")
		);
	});

	it("accepts unused service-account key fields", ({ expect }) => {
		const keyWithUnusedFields = JSON.stringify({
			private_key: "fake-private-key",
			client_email: clientEmail,
			private_key_id: "test-key-id",
			token_uri: "https://oauth2.googleapis.com/token",
			universe_domain: "googleapis.com",
			unused_nested: { value: true },
		});

		expect(validateAndEncodeGarKey(keyWithUnusedFields, clientEmail)).toBe(
			Buffer.from(keyWithUnusedFields, "utf8").toString("base64")
		);
	});

	it("throws when --gar-email does not match the key's client_email", ({
		expect,
	}) => {
		expect(() =>
			validateAndEncodeGarKey(serviceAccountKey, "wrong@example.com")
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: The provided --gar-email "wrong@example.com" does not match the service account email "wrangler-test@test-project.iam.gserviceaccount.com" in the key.]`
		);
	});

	it("rejects input that is neither JSON nor base64-encoded JSON", ({
		expect,
	}) => {
		expect(() =>
			validateAndEncodeGarKey("this is not a valid key", clientEmail)
		).toThrowErrorMatchingInlineSnapshot(
			"[Error: The Google service account key must be a JSON key file or its base64-encoded form.]"
		);
	});

	it("rejects a JSON value that is not an object", ({ expect }) => {
		expect(() =>
			validateAndEncodeGarKey("null", clientEmail)
		).toThrowErrorMatchingInlineSnapshot(
			"[Error: The Google service account key must be a JSON key file or its base64-encoded form.]"
		);
	});

	it("gives a targeted error when only a PEM private key is provided", ({
		expect,
	}) => {
		const pem =
			"-----BEGIN PRIVATE KEY-----\nMIIfakekeydata\n-----END PRIVATE KEY-----\n";
		expect(() =>
			validateAndEncodeGarKey(pem, clientEmail)
		).toThrowErrorMatchingInlineSnapshot(
			"[Error: The provided key appears to be a PEM private key. Provide the full Google service-account JSON key file, not just the private key.]"
		);
	});

	it("rejects a JSON string containing a base64-encoded key", ({ expect }) => {
		const base64Key = Buffer.from(serviceAccountKey, "utf8").toString("base64");
		expect(() =>
			validateAndEncodeGarKey(JSON.stringify(base64Key), clientEmail)
		).toThrowErrorMatchingInlineSnapshot(
			"[Error: The Google service account key must be a JSON key file or its base64-encoded form.]"
		);
	});

	it("rejects a key missing private_key", ({ expect }) => {
		expect(() =>
			validateAndEncodeGarKey(
				JSON.stringify({ client_email: clientEmail }),
				clientEmail
			)
		).toThrowErrorMatchingInlineSnapshot(
			"[Error: The Google service account key is missing required fields (private_key, client_email).]"
		);
	});

	it("rejects a key missing client_email", ({ expect }) => {
		expect(() =>
			validateAndEncodeGarKey(
				JSON.stringify({ private_key: "fake-private-key" }),
				clientEmail
			)
		).toThrowErrorMatchingInlineSnapshot(
			"[Error: The Google service account key is missing required fields (private_key, client_email).]"
		);
	});

	it("rejects a key with an empty private_key", ({ expect }) => {
		expect(() =>
			validateAndEncodeGarKey(
				JSON.stringify({ private_key: "", client_email: clientEmail }),
				clientEmail
			)
		).toThrowErrorMatchingInlineSnapshot(
			"[Error: The Google service account key has an empty private_key or client_email.]"
		);
	});

	it("rejects a key with an empty private_key_id", ({ expect }) => {
		expect(() =>
			validateAndEncodeGarKey(
				JSON.stringify({
					private_key: "fake-private-key",
					client_email: clientEmail,
					private_key_id: "",
				}),
				clientEmail
			)
		).toThrowErrorMatchingInlineSnapshot(
			"[Error: The Google service account key has an empty or invalid private_key_id.]"
		);
	});

	it("rejects a key with a non-string private_key_id", ({ expect }) => {
		expect(() =>
			validateAndEncodeGarKey(
				JSON.stringify({
					private_key: "fake-private-key",
					client_email: clientEmail,
					private_key_id: 42,
				}),
				clientEmail
			)
		).toThrowErrorMatchingInlineSnapshot(
			"[Error: The Google service account key has an empty or invalid private_key_id.]"
		);
	});
});
