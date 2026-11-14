import { describe, test } from "vitest";
import { getRemoteBindings } from "./config-bindings";

describe("getRemoteBindings", () => {
	test("maps supported remote bindings", ({ expect }) => {
		expect(
			getRemoteBindings({
				env: {
					ANALYTICS: {
						type: "analytics",
						dev: { remote: true },
					},
					K2: {
						type: "k2",
						stream: "stream-id",
					},
					HYPERDRIVE: {
						type: "hyperdrive",
						id: "hyperdrive-id",
						dev: { remote: true },
					},
				},
			})
		).toEqual({
			ANALYTICS: {
				type: "analytics",
				remote: true,
			},
			K2: {
				type: "k2",
				stream: "stream-id",
				remote: undefined,
			},
			HYPERDRIVE: {
				type: "hyperdrive",
				id: "hyperdrive-id",
				remote: true,
			},
		});
	});

	test("maps send-email bindings", ({ expect }) => {
		expect(
			getRemoteBindings({
				env: {
					DESTINATION: {
						type: "send-email",
						destinationAddress: "destination@example.com",
						allowedSenderAddresses: ["sender@example.com"],
						dev: { remote: true },
					},
					ALLOWED_DESTINATIONS: {
						type: "send-email",
						allowedDestinationAddresses: [
							"first@example.com",
							"second@example.com",
						],
					},
					UNRESTRICTED: { type: "send-email" },
				},
			})
		).toEqual({
			DESTINATION: {
				type: "send_email",
				destination_address: "destination@example.com",
				allowed_sender_addresses: ["sender@example.com"],
				remote: true,
			},
			ALLOWED_DESTINATIONS: {
				type: "send_email",
				allowed_destination_addresses: [
					"first@example.com",
					"second@example.com",
				],
				allowed_sender_addresses: undefined,
				remote: undefined,
			},
			UNRESTRICTED: {
				type: "send_email",
				allowed_sender_addresses: undefined,
				remote: undefined,
			},
		});
	});
});

test("preserves cross-account Worker identity in remote sessions", ({
	expect,
}) => {
	expect(
		getRemoteBindings({
			env: {
				PAYMENTS: {
					type: "worker",
					worker: "payments",
					accountId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
					exportName: "PublicAPI",
					dev: { remote: true },
				},
			},
		})
	).toEqual({
		PAYMENTS: {
			type: "service",
			service: "payments",
			target_account_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			entrypoint: "PublicAPI",
			remote: true,
		},
	});
});

test("preserves storage owners in remote session metadata", ({ expect }) => {
	const accountId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
	const bindings = getRemoteBindings({
		env: {
			DB: { type: "d1", id: "database", accountId, dev: { remote: true } },
			KV: { type: "kv", id: "namespace", accountId, dev: { remote: true } },
			BUCKET: {
				type: "r2",
				name: "existing",
				jurisdiction: "eu",
				accountId,
				dev: { remote: true },
			},
		},
	});
	for (const binding of Object.values(bindings)) {
		expect(binding).toMatchObject({
			target_account_id: accountId,
			remote: true,
		});
	}
	expect(bindings.BUCKET).toMatchObject({ jurisdiction: "eu" });
});
