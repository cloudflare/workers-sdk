import { describe, it } from "vitest";
import { getBindingValue } from "../src/preview/shared";

describe("getBindingValue", () => {
	it("shows an OIDC token binding's audience", ({ expect }) => {
		expect(
			getBindingValue({
				type: "oidc_token",
				audience: "https://api.example.com",
			})
		).toBe("https://api.example.com");
	});

	it("shows an OIDC token binding's alg after its audience", ({ expect }) => {
		expect(
			getBindingValue({
				type: "oidc_token",
				audience: "api://AzureADTokenExchange",
				alg: "RS256",
			})
		).toBe("api://AzureADTokenExchange, RS256");
	});
});
