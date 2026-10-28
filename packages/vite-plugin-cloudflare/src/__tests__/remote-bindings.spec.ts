import { describe, test, vi } from "vitest";
import {
	getRemoteBindings,
	warnForDefaultRemoteBindings,
} from "../remote-bindings";

describe("warnForDefaultRemoteBindings", () => {
	test.for([
		{ remote: undefined, enabled: true, warns: true },
		{ remote: false, enabled: true, warns: false },
		{ remote: true, enabled: true, warns: false },
		{ remote: undefined, enabled: false, warns: false },
		{ remote: false, enabled: false, warns: false },
		{ remote: true, enabled: false, warns: false },
	])(
		"remote=$remote enabled=$enabled",
		({ remote, enabled, warns }, { expect }) => {
			const warn = vi.fn();
			const bindings = getRemoteBindings({
				env: {
					REPOS: { type: "artifacts", namespace: "examples", dev: { remote } },
					KV: { type: "kv", id: "kv-id" },
				},
			});
			warnForDefaultRemoteBindings(bindings, enabled, warn);
			if (warns) {
				expect(warn).toHaveBeenCalledExactlyOnceWith(
					"Artifacts binding REPOS uses the deployed resource. Set `remote: false` to use the local simulator, or `remote: true` to silence this warning."
				);
			} else {
				expect(warn).not.toHaveBeenCalled();
			}
		}
	);
});

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
