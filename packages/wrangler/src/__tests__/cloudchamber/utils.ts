import * as fs from "node:fs";
import { http, HttpResponse } from "msw";
import * as TOML from "smol-toml";
import { vi } from "vitest";
import * as user from "../../user";
import { msw } from "../helpers/msw";
import type { CompleteAccountCustomer } from "@cloudflare/containers-shared";
import type { CloudchamberConfig } from "@cloudflare/workers-utils";

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

type DeepPartial<T> = {
	[P in keyof T]?: DeepPartial<T[P]>;
};

export function mockAccount(
	account: DeepPartial<CompleteAccountCustomer> = {
		external_account_id: process.env.CLOUDFLARE_ACCOUNT_ID,
		limits: { disk_mb_per_deployment: 2000 },
	}
) {
	const spy = vi.spyOn(user, "getScopes");
	spy.mockImplementationOnce(() => ["cloudchamber:write", "containers:write"]);

	msw.use(
		http.get(
			"*/me",
			async () => {
				return HttpResponse.json(account);
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
