import * as fs from "node:fs";
import * as TOML from "@iarna/toml";
import { http, HttpResponse } from "msw";
import * as user from "../../user";
import { msw } from "../helpers/msw";
import type { CloudchamberConfig } from "../../config/environment";

export function setWranglerConfig(cloudchamber: CloudchamberConfig) {
	fs.writeFileSync(
		"./wrangler.toml",
		TOML.stringify({
			name: "my-container",
			cloudchamber: { ...cloudchamber },
		}),

		"utf-8"
	);
}

export function mockAccount() {
	const spy = vi.spyOn(user, "getScopes");
	spy.mockImplementationOnce(() => ["cloudchamber:write", "containers:write"]);

	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

	msw.use(
		http.get(
			"*/me",
			async () => {
				return HttpResponse.json({
					external_account_id: accountId,
					limits: {
						disk_mb_per_deployment: 2000,
					},
				});
			},
			{ once: true }
		)
	);
}

export function mockAccountV4(scopes: user.Scope[] = ["containers:write"]) {
	const spy = vi.spyOn(user, "getScopes");
	spy.mockImplementationOnce(() => scopes);

	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

	msw.use(
		http.get(
			"*/me",
			async () => {
				return HttpResponse.json(
					{
						success: true,
						result: {
							external_account_id: accountId,
							limits: {
								disk_mb_per_deployment: 2000,
							},
						},
					},
					{ type: "application/json" }
				);
			},
			{ once: true }
		)
	);
}
