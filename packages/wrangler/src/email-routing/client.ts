import { fetchPagedListResult, fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type {
	CloudflareZone,
	EmailRoutingAddress,
	EmailRoutingCatchAllRule,
	EmailRoutingDnsRecord,
	EmailRoutingRule,
	EmailRoutingSettings,
} from "./index";
import type { Config } from "@cloudflare/workers-utils";

// --- Zones ---

export async function listZones(config: Config): Promise<CloudflareZone[]> {
	const accountId = await requireAuth(config);
	return await fetchPagedListResult<CloudflareZone>(
		config,
		`/zones`,
		{},
		new URLSearchParams({ "account.id": accountId })
	);
}

// --- Settings ---

export async function getEmailRoutingSettings(
	config: Config,
	zoneId: string
): Promise<EmailRoutingSettings> {
	await requireAuth(config);
	return await fetchResult<EmailRoutingSettings>(
		config,
		`/zones/${zoneId}/email/routing`
	);
}

// --- DNS (enable/disable/get/unlock) ---

export async function enableEmailRouting(
	config: Config,
	zoneId: string
): Promise<EmailRoutingSettings> {
	await requireAuth(config);
	return await fetchResult<EmailRoutingSettings>(
		config,
		`/zones/${zoneId}/email/routing/dns`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		}
	);
}

export async function disableEmailRouting(
	config: Config,
	zoneId: string
): Promise<EmailRoutingDnsRecord[]> {
	await requireAuth(config);
	return await fetchResult<EmailRoutingDnsRecord[]>(
		config,
		`/zones/${zoneId}/email/routing/dns`,
		{
			method: "DELETE",
		}
	);
}

export async function getEmailRoutingDns(
	config: Config,
	zoneId: string
): Promise<EmailRoutingDnsRecord[]> {
	await requireAuth(config);
	return await fetchResult<EmailRoutingDnsRecord[]>(
		config,
		`/zones/${zoneId}/email/routing/dns`
	);
}

export async function unlockEmailRoutingDns(
	config: Config,
	zoneId: string
): Promise<EmailRoutingSettings> {
	await requireAuth(config);
	return await fetchResult<EmailRoutingSettings>(
		config,
		`/zones/${zoneId}/email/routing/dns`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		}
	);
}

// --- Rules ---

export async function listEmailRoutingRules(
	config: Config,
	zoneId: string
): Promise<EmailRoutingRule[]> {
	await requireAuth(config);
	return await fetchPagedListResult<EmailRoutingRule>(
		config,
		`/zones/${zoneId}/email/routing/rules`
	);
}

export async function getEmailRoutingRule(
	config: Config,
	zoneId: string,
	ruleId: string
): Promise<EmailRoutingRule> {
	await requireAuth(config);
	return await fetchResult<EmailRoutingRule>(
		config,
		`/zones/${zoneId}/email/routing/rules/${ruleId}`
	);
}

export async function createEmailRoutingRule(
	config: Config,
	zoneId: string,
	body: {
		actions: { type: string; value?: string[] }[];
		matchers: { type: string; field?: string; value?: string }[];
		name?: string;
		enabled?: boolean;
		priority?: number;
	}
): Promise<EmailRoutingRule> {
	await requireAuth(config);
	return await fetchResult<EmailRoutingRule>(
		config,
		`/zones/${zoneId}/email/routing/rules`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}
	);
}

export async function updateEmailRoutingRule(
	config: Config,
	zoneId: string,
	ruleId: string,
	body: {
		actions: { type: string; value?: string[] }[];
		matchers: { type: string; field?: string; value?: string }[];
		name?: string;
		enabled?: boolean;
		priority?: number;
	}
): Promise<EmailRoutingRule> {
	await requireAuth(config);
	return await fetchResult<EmailRoutingRule>(
		config,
		`/zones/${zoneId}/email/routing/rules/${ruleId}`,
		{
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}
	);
}

export async function deleteEmailRoutingRule(
	config: Config,
	zoneId: string,
	ruleId: string
): Promise<EmailRoutingRule> {
	await requireAuth(config);
	return await fetchResult<EmailRoutingRule>(
		config,
		`/zones/${zoneId}/email/routing/rules/${ruleId}`,
		{
			method: "DELETE",
		}
	);
}

// --- Catch-All ---

export async function getEmailRoutingCatchAll(
	config: Config,
	zoneId: string
): Promise<EmailRoutingCatchAllRule> {
	await requireAuth(config);
	return await fetchResult<EmailRoutingCatchAllRule>(
		config,
		`/zones/${zoneId}/email/routing/rules/catch_all`
	);
}

export async function updateEmailRoutingCatchAll(
	config: Config,
	zoneId: string,
	body: {
		actions: { type: string; value?: string[] }[];
		matchers: { type: string }[];
		enabled?: boolean;
		name?: string;
	}
): Promise<EmailRoutingCatchAllRule> {
	await requireAuth(config);
	return await fetchResult<EmailRoutingCatchAllRule>(
		config,
		`/zones/${zoneId}/email/routing/rules/catch_all`,
		{
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}
	);
}

// --- Addresses ---

export async function listEmailRoutingAddresses(
	config: Config
): Promise<EmailRoutingAddress[]> {
	const accountId = await requireAuth(config);
	return await fetchPagedListResult<EmailRoutingAddress>(
		config,
		`/accounts/${accountId}/email/routing/addresses`
	);
}

export async function getEmailRoutingAddress(
	config: Config,
	addressId: string
): Promise<EmailRoutingAddress> {
	const accountId = await requireAuth(config);
	return await fetchResult<EmailRoutingAddress>(
		config,
		`/accounts/${accountId}/email/routing/addresses/${addressId}`
	);
}

export async function createEmailRoutingAddress(
	config: Config,
	email: string
): Promise<EmailRoutingAddress> {
	const accountId = await requireAuth(config);
	return await fetchResult<EmailRoutingAddress>(
		config,
		`/accounts/${accountId}/email/routing/addresses`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email }),
		}
	);
}

export async function deleteEmailRoutingAddress(
	config: Config,
	addressId: string
): Promise<EmailRoutingAddress> {
	const accountId = await requireAuth(config);
	return await fetchResult<EmailRoutingAddress>(
		config,
		`/accounts/${accountId}/email/routing/addresses/${addressId}`,
		{
			method: "DELETE",
		}
	);
}
