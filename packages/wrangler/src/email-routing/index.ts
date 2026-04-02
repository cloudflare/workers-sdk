import { createNamespace } from "../core/create-command";

export const emailNamespace = createNamespace({
	metadata: {
		description: "Manage Cloudflare Email services",
		status: "open beta",
		owner: "Product: Email Service",
	},
});

export const emailRoutingNamespace = createNamespace({
	metadata: {
		description: "Manage Email Routing",
		status: "open beta",
		owner: "Product: Email Service",
	},
});

export const emailRoutingDnsNamespace = createNamespace({
	metadata: {
		description: "Manage Email Routing DNS settings",
		status: "open beta",
		owner: "Product: Email Service",
	},
});

export const emailRoutingRulesNamespace = createNamespace({
	metadata: {
		description: "Manage Email Routing rules",
		status: "open beta",
		owner: "Product: Email Service",
	},
});

export const emailRoutingAddressesNamespace = createNamespace({
	metadata: {
		description: "Manage Email Routing destination addresses",
		status: "open beta",
		owner: "Product: Email Service",
	},
});

export const emailSendingNamespace = createNamespace({
	metadata: {
		description: "Manage Email Sending",
		status: "open beta",
		owner: "Product: Email Service",
	},
});

export const emailSendingDnsNamespace = createNamespace({
	metadata: {
		description: "Manage Email Sending DNS records",
		status: "open beta",
		owner: "Product: Email Service",
	},
});

export const domainArgs = {
	domain: {
		type: "string",
		demandOption: true,
		description: "Domain name (e.g. example.com)",
	},
	"zone-id": {
		type: "string",
		description: "Zone ID (optional, skips zone lookup if provided)",
	},
} as const;

export interface EmailRoutingSettings {
	id: string;
	enabled: boolean;
	name: string;
	created: string;
	modified: string;
	skip_wizard: boolean;
	status: string;
	tag: string;
}

export interface EmailRoutingDnsRecord {
	content: string;
	name: string;
	priority?: number;
	ttl: number;
	type: string;
}

export interface EmailRoutingRule {
	id: string;
	actions: EmailRoutingAction[];
	enabled: boolean;
	matchers: EmailRoutingMatcher[];
	name: string;
	priority: number;
	tag: string;
}

export interface EmailRoutingAction {
	type: string;
	value?: string[];
}

export interface EmailRoutingMatcher {
	type: string;
	field?: string;
	value?: string;
}

export interface EmailRoutingCatchAllRule {
	id: string;
	actions: EmailRoutingAction[];
	enabled: boolean;
	matchers: { type: string }[];
	name: string;
	tag: string;
}

export interface EmailRoutingAddress {
	id: string;
	created: string;
	email: string;
	modified: string;
	tag: string;
	verified: string;
}

export interface EmailSendingSubdomain {
	tag: string;
	name: string;
	enabled: boolean;
	status?: string;
}

export interface EmailSendingSettings extends EmailRoutingSettings {
	subdomains?: EmailSendingSubdomain[];
}

export interface EmailSendingDnsRecord {
	content?: string;
	name?: string;
	priority?: number;
	ttl?: number;
	type?: string;
}

export interface EmailSendingSendResponse {
	delivered: string[];
	permanent_bounces: string[];
	queued: string[];
}
