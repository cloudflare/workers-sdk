import { describe, expect, it } from "vitest";
import { validateTunnelRouteDnsHostname } from "../tunnel/route/dns";

describe("tunnel route dns hostname validation", () => {
	it("accepts and normalizes IDN hostnames to ASCII (punycode)", () => {
		const ascii = validateTunnelRouteDnsHostname("tést.example.com", true);
		expect(ascii).toMatch(/^xn--/);
		expect(ascii).toMatch(/\.example\.com$/);
	});

	it("accepts wildcard prefix", () => {
		const ascii = validateTunnelRouteDnsHostname("*.tést.example.com", true);
		expect(ascii?.startsWith("*."))
			.toBe(true);
	});

	it("rejects invalid hostnames", () => {
		expect(validateTunnelRouteDnsHostname("..", true)).toBeNull();
	});
});
