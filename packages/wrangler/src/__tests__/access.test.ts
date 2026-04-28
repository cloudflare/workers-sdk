import ci from "ci-info";
import { beforeEach, describe, it, vi } from "vitest";
import {
	clearAccessCaches,
	domainUsesAccess,
	getAccessHeaders,
} from "../user/access";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw, mswAccessHandlers } from "./helpers/msw";

describe("access", () => {
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		clearAccessCaches();
		msw.use(...mswAccessHandlers);
	});

	describe("domainUsesAccess", () => {
		it("should correctly detect an access protected domain", async ({
			expect,
		}) => {
			expect(await domainUsesAccess("access-protected.com")).toBeTruthy();
			expect(await domainUsesAccess("not-access-protected.com")).toBeFalsy();
		});
	});

	describe("getAccessHeaders", () => {
		it("should return empty headers for non-access-protected domains", async ({
			expect,
		}) => {
			expect(await getAccessHeaders("not-access-protected.com")).toEqual({});
		});

		describe("service token authentication", () => {
			it("should return service token headers when both env vars are set", async ({
				expect,
			}) => {
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_ID", "test-client-id.access");
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_SECRET", "test-client-secret");

				const headers = await getAccessHeaders("access-protected.com");
				expect(headers).toEqual({
					"CF-Access-Client-Id": "test-client-id.access",
					"CF-Access-Client-Secret": "test-client-secret",
				});
				// No warning is presented since both env variables are set
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			it("should warn when only CLOUDFLARE_ACCESS_CLIENT_ID is set", async ({
				expect,
			}) => {
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_ID", "test-client-id.access");
				setIsTTY(false);

				await expect(
					getAccessHeaders("access-protected.com")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The domain "access-protected.com" is behind Cloudflare Access, but no Access Service Token credentials were found and the current environment is non-interactive.
Set the CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET environment variables to authenticate with an Access Service Token.
See https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/]`
				);
				expect(std.warn).toContain(
					"Both CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET must be set"
				);
				expect(std.warn).toContain(
					"Only CLOUDFLARE_ACCESS_CLIENT_ID was found"
				);
			});

			it("should warn when only CLOUDFLARE_ACCESS_CLIENT_SECRET is set", async ({
				expect,
			}) => {
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_SECRET", "test-client-secret");
				setIsTTY(false);

				await expect(
					getAccessHeaders("access-protected.com")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The domain "access-protected.com" is behind Cloudflare Access, but no Access Service Token credentials were found and the current environment is non-interactive.
Set the CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET environment variables to authenticate with an Access Service Token.
See https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/]`
				);
				expect(std.warn).toContain(
					"Both CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET must be set"
				);
				expect(std.warn).toContain(
					"Only CLOUDFLARE_ACCESS_CLIENT_SECRET was found"
				);
			});
		});

		describe("non-interactive environment", () => {
			it("should throw actionable error when non-interactive and no service token", async ({
				expect,
			}) => {
				setIsTTY(false);

				await expect(
					getAccessHeaders("access-protected.com")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The domain "access-protected.com" is behind Cloudflare Access, but no Access Service Token credentials were found and the current environment is non-interactive.
Set the CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET environment variables to authenticate with an Access Service Token.
See https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/]`
				);
			});

			it("should throw actionable error when in CI and no service token", async ({
				expect,
			}) => {
				setIsTTY(true);
				vi.mocked(ci).isCI = true;

				await expect(
					getAccessHeaders("access-protected.com")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The domain "access-protected.com" is behind Cloudflare Access, but no Access Service Token credentials were found and the current environment is non-interactive.
Set the CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET environment variables to authenticate with an Access Service Token.
See https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/]`
				);
			});
		});

		describe("interactive environment (cloudflared fallback)", () => {
			it("should error without cloudflared installed on an access protected domain", async ({
				expect,
			}) => {
				setIsTTY(true);
				vi.mocked(ci).isCI = false;

				await expect(
					getAccessHeaders("access-protected.com")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: To use Wrangler with Cloudflare Access, please install \`cloudflared\` from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation]`
				);
			});
		});
	});
});
