import { buildPublicUrl, getLocallyAccessibleHost } from "miniflare";
import { test } from "vitest";

test("getLocallyAccessibleHost: returns hostnames and IPv4 addresses unchanged", ({
	expect,
}) => {
	expect(getLocallyAccessibleHost("localhost")).toBe("localhost");
	expect(getLocallyAccessibleHost("127.0.0.1")).toBe("127.0.0.1");
	expect(getLocallyAccessibleHost("example.com")).toBe("example.com");
});

test("getLocallyAccessibleHost: normalizes wildcard listen addresses to 127.0.0.1", ({
	expect,
}) => {
	expect(getLocallyAccessibleHost("0.0.0.0")).toBe("127.0.0.1");
	expect(getLocallyAccessibleHost("::")).toBe("127.0.0.1");
	expect(getLocallyAccessibleHost("*")).toBe("127.0.0.1");
});

test("getLocallyAccessibleHost: brackets IPv6 addresses", ({ expect }) => {
	expect(getLocallyAccessibleHost("::1")).toBe("[::1]");
	expect(getLocallyAccessibleHost("fe80::1")).toBe("[fe80::1]");
});

test("buildPublicUrl: brackets IPv6 hosts and produces a URL parseable by new URL()", ({
	expect,
}) => {
	const url = buildPublicUrl({ hostname: "::1", port: 8787 });
	expect(url).toBe("http://[::1]:8787");
	expect(() => new URL(url)).not.toThrow();
});

test("buildPublicUrl: uses https when `secure` is true", ({ expect }) => {
	const url = buildPublicUrl({
		hostname: "::1",
		port: 8787,
		secure: true,
	});
	expect(url).toBe("https://[::1]:8787");
	expect(url.startsWith("https://")).toBe(true);
});

test("buildPublicUrl: defaults to localhost when no hostname is provided", ({
	expect,
}) => {
	expect(buildPublicUrl({ port: 8787 })).toBe("http://localhost:8787");
});

test("buildPublicUrl: normalizes wildcard listen addresses to 127.0.0.1", ({
	expect,
}) => {
	expect(buildPublicUrl({ hostname: "0.0.0.0", port: 1234 })).toBe(
		"http://127.0.0.1:1234"
	);
	expect(buildPublicUrl({ hostname: "::", port: 1234 })).toBe(
		"http://127.0.0.1:1234"
	);
	expect(buildPublicUrl({ hostname: "*", port: 1234 })).toBe(
		"http://127.0.0.1:1234"
	);
});
