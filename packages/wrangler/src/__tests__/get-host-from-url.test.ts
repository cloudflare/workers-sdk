import { describe, it } from "vitest";
import { getHostFromUrl } from "../zones";

//return the host given a url-like string
describe("getHostFromUrl", () => {
	it("should return the host from a url", ({ expect }) => {
		expect(getHostFromUrl("https://www.example.com")).toBe("www.example.com");
	});

	it("should return the host from a url using wildcard *.", ({ expect }) => {
		expect(getHostFromUrl("*.example.com")).toBe("example.com");
	});

	it("should return the host from a url using wildcard *", ({ expect }) => {
		expect(getHostFromUrl("*example.com")).toBe("example.com");
	});
});
