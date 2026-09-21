import { extractConfigBindings } from "@cloudflare/deploy-helpers";
import { mapWorkerMetadataBindings } from "@cloudflare/workers-utils";
import type {
	Binding,
	EnvBindings,
	PreviewBaseConfig,
} from "@cloudflare/deploy-helpers";
import type {
	Config,
	Environment,
	PreviewsConfig,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";

export const REPLACE_ME = "<REPLACE_ME>";

type PreviewConfigSource =
	| { kind: "localConfig"; config: Config }
	| { kind: "previewBase"; config: PreviewBaseConfig };

type PreviewPolicyMessage<Value> =
	| string
	| ((value: Value) => string | undefined);

type PreviewPolicy<Value> = {
	exclude?: true;
	limitationLabel?: PreviewPolicyMessage<Value>;
	keepLocalValuesUnredacted?: string[];
	blockingMessage?: PreviewPolicyMessage<Value>;
};

type BindingPolicy = PreviewPolicy<Binding>;

export type PreviewTopLevelSettings = {
	[
		K in keyof Pick<
			Environment,
			| "define"
			| "observability"
			| "logpush"
			| "limits"
			| "placement"
			| "cache"
			| "containers"
			| "tail_consumers"
			| "streaming_tail_consumers"
			| "queues"
			| "triggers"
		>
	]: Environment[K] | undefined;
};

type SettingPolicy<Setting extends keyof PreviewTopLevelSettings> =
	PreviewPolicy<NonNullable<PreviewTopLevelSettings[Setting]>>;

type SettingPolicies = {
	[Setting in keyof PreviewTopLevelSettings]: SettingPolicy<Setting>;
};

export type ProposedPreviewsConfig = {
	config: PreviewsConfig;
	messages: string[];
	blockingDeploymentMessages: string[];
};

const DURABLE_OBJECTS_MESSAGE =
	"This Worker uses Durable Objects. They are not included in the suggested Preview configuration.\nFollow the setup instructions so each Preview automatically gets a new, isolated Durable Object namespace:\nhttps://developers.cloudflare.com/workers/previews/resources/#durable-objects";
const CONTAINERS_MESSAGE =
	"This Worker uses Containers. They are not included in the suggested Preview configuration.\nFollow the setup instructions so each Preview automatically gets a new, isolated Container app and state:\nhttps://developers.cloudflare.com/workers/previews/resources/#containers";
const previewLimitationsMessage = (
	limitationLabels: string[]
): string | undefined =>
	limitationLabels.length === 0
		? undefined
		: `These settings have limitations in Worker Previews: ${limitationLabels.join(
				", "
			)}.\nWrangler did not add them automatically. Review the limitations, then decide how you want to configure them for your Preview.\nLearn more: https://developers.cloudflare.com/workers/previews/limitations/`;

const bindingPolicies: Record<Binding["type"], BindingPolicy> = {
	inherit: { exclude: true },
	plain_text: {},
	secret_text: { exclude: true },
	json: {},
	wasm_module: { exclude: true },
	text_blob: { exclude: true },
	browser: {},
	ai: {},
	images: {},
	stream: {},
	version_metadata: {},
	data_blob: { exclude: true },
	ai_search_namespace: {},
	ai_search: {},
	agent_memory: { exclude: true },
	kv_namespace: {},
	media: {},
	send_email: {},
	durable_object_namespace: {
		exclude: true,
		blockingMessage: DURABLE_OBJECTS_MESSAGE,
	},
	workflow: {
		exclude: true,
		limitationLabel: "Workflows",
	},
	queue: {},
	r2_bucket: { keepLocalValuesUnredacted: ["jurisdiction"] },
	d1: {},
	vectorize: {},
	hyperdrive: {},
	service: {
		exclude: true,
		limitationLabel: "Service Bindings",
	},
	analytics_engine: {},
	dispatch_namespace: {},
	mtls_certificate: {},
	pipelines: {},
	secrets_store_secret: {},
	artifacts: {},
	unsafe_hello_world: { exclude: true },
	flagship: {},
	ratelimit: {},
	worker_loader: {},
	vpc_service: {},
	vpc_network: { exclude: true },
	logfwdr: { exclude: true },
	assets: { exclude: true },
};

const settingPolicies: SettingPolicies = {
	define: {},
	observability: {},
	logpush: {},
	limits: {},
	placement: { keepLocalValuesUnredacted: ["mode"] },
	cache: {},
	containers: {
		exclude: true,
		blockingMessage: (value) =>
			value.length > 0 ? CONTAINERS_MESSAGE : undefined,
	},
	tail_consumers: {
		limitationLabel: (value) =>
			value.some(({ environment }) => environment !== undefined)
				? "Tail consumer environments"
				: undefined,
	},
	streaming_tail_consumers: { exclude: true },
	queues: {
		exclude: true,
		limitationLabel: (value) =>
			(value.consumers?.length ?? 0) > 0 ? "Queue consumers" : undefined,
	},
	triggers: {
		exclude: true,
		limitationLabel: (value) => {
			const hasCrons = (value.crons?.length ?? 0) > 0;
			const hasEvents = (value.events?.length ?? 0) > 0;
			if (!hasCrons && !hasEvents) {
				return undefined;
			}
			return hasCrons && hasEvents
				? "Cron and Artifacts event triggers"
				: hasCrons
					? "Cron triggers"
					: "Artifacts event triggers";
		},
	},
};

// for each potential preview setting or binding we:
// - redact all values by default unless specified
// - show a <key or binding>.limitationLabel for an unsupported by previews message
// - allow explicitly excluding the key from previews copy paste block
function applyPolicy<Value>(
	value: Value,
	policy: PreviewPolicy<Value>,
	source: PreviewConfigSource["kind"]
): {
	value: Value | undefined;
	limitationLabel: string | undefined;
	blockingMessage: string | undefined;
} {
	const blockingMessage =
		typeof policy.blockingMessage === "function"
			? policy.blockingMessage(value)
			: policy.blockingMessage;
	const limitationLabel =
		typeof policy.limitationLabel === "function"
			? policy.limitationLabel(value)
			: policy.limitationLabel;

	if (policy.exclude === true) {
		return { value: undefined, limitationLabel, blockingMessage };
	}

	if (source === "previewBase") {
		return { value, limitationLabel, blockingMessage };
	}

	return {
		value: redactLocalValues(value, policy.keepLocalValuesUnredacted) as Value,
		limitationLabel,
		blockingMessage,
	};
}

function redactLocalValues(
	value: unknown,
	keepOriginalValues: string[] = []
): unknown {
	const keep = new Set(keepOriginalValues);

	function redact(current: unknown, path = ""): unknown {
		if (typeof current === "string") {
			return keep.has(path) ? current : REPLACE_ME;
		}
		if (Array.isArray(current)) {
			return current.map((item) => redact(item, path));
		}
		if (typeof current === "object" && current !== null) {
			const redacted: Record<string, unknown> = {};
			for (const [key, child] of Object.entries(current)) {
				if (child === undefined) {
					continue;
				}
				const childPath = path === "" ? key : `${path}.${key}`;
				redacted[key] = redact(child, childPath);
			}
			return redacted;
		}
		return current;
	}

	return redact(value);
}

export function buildPreviewConfigProposal(
	bindings: EnvBindings,
	settings: PreviewTopLevelSettings,
	configSource: PreviewConfigSource["kind"]
): ProposedPreviewsConfig {
	const includedBindings: WorkerMetadataBinding[] = [];
	const includedSettings: Record<string, unknown> = {};
	const limitationLabels = new Set<string>();
	const blockingMessages = new Set<string>();

	for (const [name, binding] of Object.entries(bindings)) {
		const policy: BindingPolicy | undefined = bindingPolicies[binding.type];
		if (policy === undefined) {
			continue;
		}
		const { value, limitationLabel, blockingMessage } = applyPolicy(
			binding,
			policy,
			configSource
		);
		if (limitationLabel !== undefined) {
			limitationLabels.add(limitationLabel);
		}
		if (blockingMessage !== undefined) {
			blockingMessages.add(blockingMessage);
		}
		if (value !== undefined) {
			includedBindings.push({
				...value,
				name,
				type: binding.type,
			} as WorkerMetadataBinding);
		}
	}

	for (const setting of Object.keys(settingPolicies) as Array<
		keyof PreviewTopLevelSettings
	>) {
		const current = settings[setting];
		if (current === undefined) {
			continue;
		}
		const policy = settingPolicies[setting] as SettingPolicy<
			keyof PreviewTopLevelSettings
		>;
		const { value, limitationLabel, blockingMessage } = applyPolicy(
			current,
			policy,
			configSource
		);
		if (limitationLabel !== undefined) {
			limitationLabels.add(limitationLabel);
		}
		if (blockingMessage !== undefined) {
			blockingMessages.add(blockingMessage);
		}
		if (value === undefined || value === null) {
			continue;
		}

		includedSettings[setting] = value;
	}

	const bindingConfig = mapWorkerMetadataBindings(
		includedBindings
	) as PreviewsConfig;
	return {
		config: { ...bindingConfig, ...includedSettings } as PreviewsConfig,
		messages: [previewLimitationsMessage([...limitationLabels])].filter(
			(message): message is string => message !== undefined
		),
		blockingDeploymentMessages: [...blockingMessages],
	};
}

export function createPreviewConfigProposal(
	source: PreviewConfigSource
): ProposedPreviewsConfig {
	if (source.kind === "previewBase") {
		const config = source.config;
		const bindings = config.env ?? {};
		const settings: PreviewTopLevelSettings = {
			define: undefined,
			observability: config.observability,
			logpush: config.logpush,
			limits: config.limits,
			placement: config.placement,
			cache: config.cache,
			containers: undefined,
			tail_consumers: config.tail_consumers?.map(({ name }) => ({
				service: name,
			})),
			streaming_tail_consumers: undefined,
			queues: undefined,
			triggers: undefined,
		};
		return buildPreviewConfigProposal(bindings, settings, "previewBase");
	}

	const config = source.config;
	const bindings = extractConfigBindings({ ...config, previews: config });
	const settings: PreviewTopLevelSettings = {
		define: Object.keys(config.define).length === 0 ? undefined : config.define,
		observability: config.observability,
		logpush: config.logpush,
		limits: config.limits,
		placement: config.placement,
		cache: config.cache,
		containers: config.containers,
		tail_consumers: config.tail_consumers,
		streaming_tail_consumers: config.streaming_tail_consumers,
		queues: config.queues,
		triggers: config.triggers,
	};
	return buildPreviewConfigProposal(bindings, settings, "localConfig");
}
