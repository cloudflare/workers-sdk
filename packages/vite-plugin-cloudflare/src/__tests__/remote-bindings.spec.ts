import { describe, expect, test } from "vitest";
import { getRemoteBindings } from "../remote-bindings";

describe("getRemoteBindings", () => {
	test("maps send-email bindings", () => {
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
