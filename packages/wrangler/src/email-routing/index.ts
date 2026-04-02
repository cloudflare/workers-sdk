import { createNamespace } from "../core/create-command";

export const emailNamespace = createNamespace({
	metadata: {
		description: "Manage Cloudflare Email services",
		status: "open-beta",
		owner: "Product: Email Routing",
	},
});

export const emailRoutingNamespace = createNamespace({
	metadata: {
		description: "Manage Email Routing",
		status: "open-beta",
		owner: "Product: Email Routing",
	},
});

export const emailRoutingDnsNamespace = createNamespace({
	metadata: {
		description: "Manage Email Routing DNS settings",
		status: "open-beta",
		owner: "Product: Email Routing",
	},
});

export const emailRoutingRulesNamespace = createNamespace({
	metadata: {
		description: "Manage Email Routing rules",
		status: "open-beta",
		owner: "Product: Email Routing",
	},
});

export const emailRoutingAddressesNamespace = createNamespace({
	metadata: {
		description: "Manage Email Routing destination addresses",
		status: "open-beta",
		owner: "Product: Email Routing",
	},
});

export const emailSendingNamespace = createNamespace({
	metadata: {
		description: "Manage Email Sending",
		status: "open-beta",
		owner: "Product: Email Routing",
	},
});

export const emailSendingSubdomainsNamespace = createNamespace({
	metadata: {
		description: "Manage Email Sending subdomains",
		status: "open-beta",
		owner: "Product: Email Routing",
	},
});

export const emailSendingDnsNamespace = createNamespace({
	metadata: {
		description: "Manage Email Sending DNS records",
		status: "open-beta",
		owner: "Product: Email Routing",
	},
});

// --- Shared arg definitions ---

export const zoneArgs = {
	zone: {
		type: "string",
		description: "Domain name of the zone (e.g. example.com)",
		conflicts: ["zone-id"],
	},
	"zone-id": {
		type: "string",
		description: "Zone ID",
		conflicts: ["zone"],
	},
} as const;

// --- Types ---

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
	actions: EmailRoutingCatchAllAction[];
	enabled: boolean;
	matchers: EmailRoutingCatchAllMatcher[];
	name: string;
	tag: string;
}

export interface EmailRoutingCatchAllAction {
	type: string;
	value?: string[];
}

export interface EmailRoutingCatchAllMatcher {
	type: string;
}

export interface EmailRoutingAddress {
	id: string;
	created: string;
	email: string;
	modified: string;
	tag: string;
	verified: string;
}

export interface CloudflareZone {
	id: string;
	name: string;
	status: string;
	account: {
		id: string;
		name: string;
	};
}

// --- Email Sending types ---

export interface EmailSendingSubdomain {
	email_sending_enabled: boolean;
	name: string;
	tag: string;
	created?: string;
	email_sending_dkim_selector?: string;
	email_sending_return_path_domain?: string;
	enabled?: boolean;
	modified?: string;
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
