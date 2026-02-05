import { UserError } from "@cloudflare/workers-utils";
import { beforeEach, describe, it } from "vitest";
import { domainUsesAccess, getAccessToken } from "../user/access";
import { msw, mswAccessHandlers } from "./helpers/msw";

describe("access", () => {
	beforeEach(() => {
		msw.use(...mswAccessHandlers);
	});

	describe("basic", () => {
		it("should correctly detect an access protected domain", async ({
			expect,
		}) => {
			expect(await domainUsesAccess("access-protected.com")).toBeTruthy();
			expect(await domainUsesAccess("not-access-protected.com")).toBeFalsy();
		});
		it("should not fail without cloudflared installed", async ({ expect }) => {
			expect(await getAccessToken("not-access-protected.com")).toBeFalsy();
		});
		it("should error without cloudflared installed on an access protected domain", async ({
			expect,
		}) => {
			await expect(getAccessToken("access-protected.com")).rejects.toEqual(
				new UserError(
					"To use Wrangler with Cloudflare Access, please install `cloudflared` from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
				)
			);
		});
	});
});
