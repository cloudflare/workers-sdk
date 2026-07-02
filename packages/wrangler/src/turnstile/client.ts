import { fetchPagedListResult, fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type { Config } from "@cloudflare/workers-utils";

export const WidgetModes = ["managed", "invisible", "non-interactive"] as const;
export type WidgetMode = (typeof WidgetModes)[number];

export const ClearanceLevels = [
	"no_clearance",
	"jschallenge",
	"managed",
	"interactive",
] as const;
export type ClearanceLevel = (typeof ClearanceLevels)[number];

export const WidgetRegions = ["world", "china"] as const;
export type WidgetRegion = (typeof WidgetRegions)[number];

export type Widget = {
	sitekey: string;
	secret: string;
	name: string;
	domains: string[];
	mode: WidgetMode;
	bot_fight_mode: boolean;
	clearance_level: ClearanceLevel;
	ephemeral_id: boolean;
	offlabel: boolean;
	region: WidgetRegion;
	created_on: string;
	modified_on: string;
};

export type CreateWidgetBody = {
	name: string;
	domains: string[];
	mode: WidgetMode;
	bot_fight_mode?: boolean;
	clearance_level?: ClearanceLevel;
	ephemeral_id?: boolean;
	offlabel?: boolean;
	region?: WidgetRegion;
};

export type UpdateWidgetBody = {
	name: string;
	domains: string[];
	mode: WidgetMode;
	bot_fight_mode?: boolean;
	clearance_level?: ClearanceLevel;
	ephemeral_id?: boolean;
	offlabel?: boolean;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function createWidget(
	config: Config,
	body: CreateWidgetBody
): Promise<Widget> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/challenges/widgets`,
		{
			method: "POST",
			headers: JSON_HEADERS,
			body: JSON.stringify(body),
		}
	);
}

export async function getWidget(
	config: Config,
	sitekey: string
): Promise<Widget> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/challenges/widgets/${sitekey}`,
		{
			method: "GET",
		}
	);
}

export async function listWidgets(config: Config): Promise<Widget[]> {
	const accountId = await requireAuth(config);
	return await fetchPagedListResult(
		config,
		`/accounts/${accountId}/challenges/widgets`,
		{
			method: "GET",
		}
	);
}

export async function updateWidget(
	config: Config,
	sitekey: string,
	body: UpdateWidgetBody
): Promise<Widget> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/challenges/widgets/${sitekey}`,
		{
			method: "PUT",
			headers: JSON_HEADERS,
			body: JSON.stringify(body),
		}
	);
}

export async function deleteWidget(
	config: Config,
	sitekey: string
): Promise<void> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/challenges/widgets/${sitekey}`,
		{
			method: "DELETE",
		}
	);
}
