import { readConfig } from "../config";
import { createCommand, createNamespace } from "../core/create-command";
import { CommandLineArgsError } from "../errors";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { PRODUCTS } from "./products";

type EventSubscription = {
	id: string;
	created_at: string;
	modified_at: string;
	name: string;
	enabled: boolean;
	product_id: string;
	resource_id: string;
	queue_name: string;
	events: string[];
};

type EventSubscriptionEventSpec = {
	id: string;
	events: Array<{ name: string; description: string }>;
};

export const eventSubscriptionsNamespace = createNamespace({
	metadata: {
		owner: "Product: Queues",
		status: "open-beta",
		description: "Manage Event Subscriptions",
	},
});

export const eventSubscriptionsBrowseCommand = createCommand({
	metadata: {
		owner: "Product: Queues",
		status: "open-beta",
		description: "List available services and events",
	},

	args: {
		source: {
			type: "string",
			description: "Filter by service",
			demandOption: false,
		},
	},

	async handler(args, ctx) {
		const config = readConfig(args);
		const accountId = await requireAuth(config);

		const events = await ctx.fetchResult<EventSubscriptionEventSpec[]>(
			`/accounts/${accountId}/event_subscriptions/events`
		);

		let products = PRODUCTS.map((p) => ({
			...p,
			events: events.find((e) => e.id === p.id)?.events,
		})).filter((p) => p.events && p.events.length !== 0);

		if (args.source) {
			const sources = args.source
				.split(",")
				.map((s) => s.toLocaleLowerCase().trim());
			products = products.filter(
				(p) =>
					sources.includes(p.id.toLocaleLowerCase()) ||
					sources.includes(p.name.toLocaleLowerCase())
			);
		}

		if (products.length === 0) {
			return logger.table([{ service: "", event: "", description: "" }]);
		}

		logger.table(
			products.flatMap((p) =>
				// Disabling ESLint and using `!` because we've validated that `events` is not null
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				p.events!.map((e) => ({
					service: p.name,
					event: e.name,
					description: e.description,
				}))
			)
		);
	},
});

export const eventSubscriptionsListCommand = createCommand({
	metadata: {
		owner: "Product: Queues",
		status: "open-beta",
		description: "List configured Event Subscriptions",
	},

	async handler(args, ctx) {
		const config = readConfig(args);
		const accountId = await requireAuth(config);

		const res = await ctx.fetchResult<EventSubscription[]>(
			`/accounts/${accountId}/event_subscriptions/subscriptions?per_page=100`
		);

		if (res.length === 0) {
			return logger.table([
				{ id: "", name: "", source: "", destination: "", events: "" },
			]);
		}

		logger.table(
			res.map((s) => ({
				id: s.id,
				name: s.name,
				source: `${s.product_id}.${s.resource_id}`,
				destination: `queues.${s.queue_name}`,
				events: s.events.join(", "),
			}))
		);
	},
});

export const eventSubscriptionsGetCommand = createCommand({
	metadata: {
		owner: "Product: Queues",
		status: "open-beta",
		description: "Fetch details about a single Event Subscription",
	},

	positionalArgs: ["id"],
	args: {
		id: {
			type: "string",
			description: "ID of the Event Subscription",
			demandOption: true,
		},
	},

	async handler(args, ctx) {
		const config = readConfig(args);
		const accountId = await requireAuth(config);
		const { id } = args;

		const subscription = await ctx.fetchResult<EventSubscription>(
			`/accounts/${accountId}/event_subscriptions/subscriptions/${id}`
		);

		logger.table([
			{
				id: subscription.id,
				name: subscription.name,
				source: `${subscription.product_id}.${subscription.resource_id}`,
				destination: `queues.${subscription.queue_name}`,
				events: subscription.events.join(", "),
			},
		]);
	},
});

export const eventSubscriptionsCreateCommand = createCommand({
	metadata: {
		owner: "Product: Queues",
		status: "open-beta",
		description:
			"Create a new Event Subscription. Use `event-subscriptions browse` to see available services and events.",
	},

	positionalArgs: ["name"],
	args: {
		name: {
			type: "string",
			description: "",
			demandOption: true,
		},
		source: {
			type: "string",
			description: "<Service>.<Resource> to subscribe to",
			demandOption: true,
		},
		destination: {
			type: "string",
			description: "Name of the Queue to send events to",
			demandOption: true,
		},
		events: {
			type: "string",
			description: "Names of events to subscribe to",
			demandOption: true,
		},
	},
	validateArgs({ source }) {
		const [productId, resourceId] = source.split(".");

		const product = PRODUCTS.find((p) => p.id === productId);
		if (!product) {
			throw new CommandLineArgsError(
				`Invalid source. TODO: Write a better / more helpful error message`
			);
		}

		if (product.resource) {
			if (!resourceId) {
				throw new CommandLineArgsError(
					`Invalid resource ID. TODO: Write a better / more helpful error message`
				);
			}
		}
	},

	async handler(args, ctx) {
		const config = readConfig(args);
		const accountId = await requireAuth(config);

		const { name, source, destination: queueId, events } = args;

		const [productId, resourceId] = source.split(".");
		const product = PRODUCTS.find((p) => p.id === productId);

		// Disabling ESLint and using `!` because we've validated the argument already
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const res = await product!.subscription.create(ctx, {
			accountId,
			name,
			resourceId,
			queueId,
			events: events.split(",").map((e) => e.trim()),
		});

		logger.table([
			{
				id: res.id,
				name,
				source,
				destination: `queues.${queueId}`,
				events,
			},
		]);
	},
});

export const eventSubscriptionsUpdateCommand = createCommand({
	metadata: {
		owner: "Product: Queues",
		status: "open-beta",
		description: "Update an event subscription",
	},

	positionalArgs: ["id"],
	args: {
		id: {
			type: "string",
			description: "ID of the event subscription",
			demandOption: true,
		},
		name: {
			type: "string",
			description: "Name to set",
		},
		events: {
			type: "string",
			description: "Names of events to subscribe to",
		},
	},

	async handler(args, ctx) {
		const config = readConfig(args);
		const accountId = await requireAuth(config);

		const { id, name, events } = args;

		const subscription = await ctx.fetchResult<EventSubscription>(
			`/accounts/${accountId}/event_subscriptions/subscriptions/${id}`,
			{
				method: "PATCH",
				body: JSON.stringify({
					name,
					events: events?.split(",").map((e) => e.trim()),
				}),
			}
		);

		logger.table([
			{
				id,
				name: subscription.name,
				source: `${subscription.product_id}.${subscription.resource_id}`,
				destination: `queues.${subscription.queue_name}`,
				events: subscription.events.join(", "),
			},
		]);
	},
});

export const eventSubscriptionsDeleteCommand = createCommand({
	metadata: {
		owner: "Product: Queues",
		status: "open-beta",
		description: "<TBD>",
	},

	positionalArgs: ["id"],
	args: {
		id: {
			type: "string",
			description: "ID of the event subscription",
			demandOption: true,
		},
	},

	async handler(args, ctx) {
		const config = readConfig(args);
		const accountId = await requireAuth(config);

		const { id } = args;

		await ctx.fetchResult<EventSubscription[]>(
			`/accounts/${accountId}/event_subscriptions/subscriptions/${id}`,
			{ method: "DELETE" }
		);

		logger.log(`Event subscription deleted!`);
	},
});
