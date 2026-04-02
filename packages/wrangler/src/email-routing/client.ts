import { fetchPagedListResult, fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type {
	EmailRoutingAddress,
	EmailRoutingCatchAllRule,
	EmailRoutingDnsRecord,
	EmailRoutingRule,
	EmailRoutingSettings,
	EmailSendingDnsRecord,
	EmailSendingSendResponse,
	EmailSendingSettings,
} from "./index";
import type { Config } from "@cloudflare/workers-utils";

export async function listEmailRoutingZones(
	config: Config
): Promise<EmailRoutingSettings[]> {
	const accountId = await requireAuth(config);
	return await fetchPagedListResult<EmailRoutingSettings>(
		config,
		`/accounts/${accountId}/email/routing/zones`
	);
}

export async function listEmailSendingZones(
	config: Config
): Promise<EmailRoutingSettings[]> {
	const accountId = await requireAuth(config);
	return await fetchPagedListResult<EmailRoutingSettings>(
		config,
		`/accounts/${accountId}/email/sending/zones`
	);
}

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

export async function enableEmailRouting(
	config: Config,
	zoneId: string
): Promise<EmailRoutingSettings> {
	await requireAuth(config);
	return await fetchResult<EmailRoutingSettings>(
		config,
		`/zones/${zoneId}/email/routing/enable`,
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
): Promise<EmailRoutingSettings> {
	await requireAuth(config);
	return await fetchResult<EmailRoutingSettings>(
		config,
		`/zones/${zoneId}/email/routing/disable`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
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
		`/zones/${zoneId}/email/routing/unlock`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		}
	);
}

export async function listEmailRoutingRules(
	config: Config,
	zoneId: string
): Promise<EmailRoutingRule[]> {
	await requireAuth(config);
	return await fetchPagedListResult<EmailRoutingRule>(
		config,
		`/zones/${zoneId}/email/routing/rules`,
		{},
		new URLSearchParams({ order: "created", direction: "asc" })
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

export async function listEmailRoutingAddresses(
	config: Config
): Promise<EmailRoutingAddress[]> {
	const accountId = await requireAuth(config);
	return await fetchPagedListResult<EmailRoutingAddress>(
		config,
		`/accounts/${accountId}/email/routing/addresses`,
		{},
		new URLSearchParams({ order: "created", direction: "asc" })
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

export async function getEmailSendingSettings(
	config: Config,
	zoneId: string
): Promise<EmailSendingSettings> {
	await requireAuth(config);
	return await fetchResult<EmailSendingSettings>(
		config,
		`/zones/${zoneId}/email/sending`
	);
}

export async function enableEmailSending(
	config: Config,
	zoneId: string,
	name?: string
): Promise<EmailRoutingSettings> {
	await requireAuth(config);
	return await fetchResult<EmailRoutingSettings>(
		config,
		`/zones/${zoneId}/email/sending/enable`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(name ? { name } : {}),
		}
	);
}

export async function disableEmailSending(
	config: Config,
	zoneId: string,
	name?: string
): Promise<EmailRoutingSettings> {
	await requireAuth(config);
	return await fetchResult<EmailRoutingSettings>(
		config,
		`/zones/${zoneId}/email/sending/disable`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(name ? { name } : {}),
		}
	);
}

export async function getEmailSendingDns(
	config: Config,
	zoneId: string
): Promise<EmailSendingDnsRecord[]> {
	await requireAuth(config);
	return await fetchResult<EmailSendingDnsRecord[]>(
		config,
		`/zones/${zoneId}/email/sending/dns`
	);
}

export async function getEmailSendingSubdomainDns(
	config: Config,
	zoneId: string,
	subdomainId: string
): Promise<EmailSendingDnsRecord[]> {
	await requireAuth(config);
	return await fetchResult<EmailSendingDnsRecord[]>(
		config,
		`/zones/${zoneId}/email/sending/subdomains/${subdomainId}/dns`
	);
}

export async function sendEmail(
	config: Config,
	body: {
		from: string | { address: string; name: string };
		subject: string;
		to: string | string[];
		text?: string;
		html?: string;
		cc?: string | string[];
		bcc?: string | string[];
		reply_to?: string | { address: string; name: string };
		headers?: Record<string, string>;
		attachments?: Array<{
			content: string;
			filename: string;
			type: string;
			disposition: "attachment" | "inline";
			content_id?: string;
		}>;
	}
): Promise<EmailSendingSendResponse> {
	const accountId = await requireAuth(config);
	return await fetchResult<EmailSendingSendResponse>(
		config,
		`/accounts/${accountId}/email/sending/send`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}
	);
}

export async function sendRawEmail(
	config: Config,
	body: {
		from: string;
		recipients: string[];
		mime_message: string;
	}
): Promise<EmailSendingSendResponse> {
	const accountId = await requireAuth(config);
	return await fetchResult<EmailSendingSendResponse>(
		config,
		`/accounts/${accountId}/email/sending/send_raw`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}
	);
}
