import { createCommand, createNamespace } from "../core/create-command";
import { CommandLineArgsError } from "../errors";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { products } from "./products";
import type { EventSubscription } from "./products";
import type { EventHubProductId } from "./types";

type EventSubscriptionEventSpec = {
	id: string;
	name: string;
	events: Array<{ name: string; description: string }>;
};

export const eventSubscriptionsNamespace = createNamespace({
	metadata: {
		hidden: true,
		owner: "Product: Queues",
		status: "open-beta",
		description: "🔔 Manage Event Subscriptions",
	},
});

export const eventSubscriptionsBrowseCommand = createCommand({
	metadata: {
		owner: "Product: Queues",
		status: "open-beta",
		description: "Explore available sources and events",
	},

	args: {
		source: {
			type: "string",
			description: "A comma-separated list of source services to filter by",
			array: true,
			demandOption: false,
		},
	},

	async handler(args, ctx) {
		const accountId = await requireAuth(ctx.config);

		let events = await ctx.fetchResult<EventSubscriptionEventSpec[]>(
			ctx.config,
			`/accounts/${accountId}/event_subscriptions/events`
		);

		// Only include products that are also defined in the `products()` object.
		// This lets us avoid exposing objects that are not fully onboarded yet and
		// causing confusion for users.
		events = events.filter((e) =>
			Object.keys(products(accountId)).includes(e.id)
		);

		if (args.source) {
			// Only include products that somewhat match the ones the user requested,
			// if they did
			const sources = args.source.map((s) => s.toLocaleLowerCase().trim());
			events = events.filter((p) => {
				const id = p.id.toLocaleLowerCase().trim();
				const name = p.name.toLocaleLowerCase().trim();
				return sources.some((s) => id.includes(s) || name.includes(s));
			});
		}

		if (events.length === 0) {
			logger.warn("No sources matched your query");
			return logger.table([{ service: "", events: "" }]);
		}

		logger.table(
			events.map((p) => ({
				service: p.name,
				events: p.events.map((e) => e.name).join(", "),
			}))
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
		const accountId = await requireAuth(ctx.config);

		const res = await ctx.fetchResult<EventSubscription[]>(
			ctx.config,
			`/accounts/${accountId}/event_subscriptions/subscriptions?per_page=100`
		);

		if (res.length === 0) {
			logger.warn("No event subscriptions exist");
			return logger.table([
				{ id: "", name: "", source: "", destination: "", events: "" },
			]);
		}

		logger.table(
			res.map((s) => {
				const product = products(accountId)[s.source.service];
				// If this subscription belongs to a product that is not defined in the
				// `products()` object, that means we do not definitively know how to
				// deal with it yet. This will happen when the user is using a Wrangler
				// version that is older than the version where the product was first
				// defined. Instead of crashing / ignoring such subscriptions, we'll
				// try our best to be helpful.
				const source = product
					? product.format(s.source)
					: JSON.stringify(s.source);
				const destination = `${s.destination.service}.${s.destination.queue_id}`;
				return {
					id: s.id,
					name: s.name,
					source,
					destination,
					events: s.events.join(", "),
				};
			})
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
		const accountId = await requireAuth(ctx.config);
		const { id } = args;

		const subscription = await ctx.fetchResult<EventSubscription>(
			ctx.config,
			`/accounts/${accountId}/event_subscriptions/subscriptions/${id}`
		);

		const destination = `${subscription.destination.service}.${subscription.destination.queue_id}`;

		const product = products(accountId)[subscription.source.service];
		// If this subscription belongs to a product that is not defined in the
		// `products()` object, that means we do not definitively know how to
		// deal with it yet. This will happen when the user is using a Wrangler
		// version that is older than the version where the product was first
		// defined. Instead of crashing / ignoring such subscriptions, we'll
		// try our best to be helpful.
		const source = product
			? product.format(subscription.source)
			: JSON.stringify(subscription.source);

		logger.table([
			{
				id: subscription.id,
				name: subscription.name,
				source,
				destination,
				events: subscription.events.join(", "),
			},
		]);
	},
});

export const eventSubscriptionsCreateCommand = createCommand({
	metadata: {
		owner: "Product: Queues",
		status: "open-beta",
		description: "Create a new Event Subscription",
	},

	positionalArgs: ["name"],
	args: {
		name: {
			type: "string",
			description: "Name of the subscription",
			demandOption: true,
		},
		source: {
			type: "string",
			description:
				"The service & resource to create the subscription on. Use `event-subscriptions browse` to see available sources and events.",
			demandOption: true,
		},
		destination: {
			type: "string",
			description: "ID of the Queue to send events to",
			demandOption: true,
		},
		events: {
			type: "string",
			description: "Names of events to subscribe to",
			demandOption: true,
		},
	},
	async handler(args, ctx) {
		const accountId = await requireAuth(ctx.config);

		const [productId] = args.source.split(".");
		const product = products(accountId)[productId as EventHubProductId];
		if (!productId || !product) {
			throw new CommandLineArgsError(
				`Unrecognized source service. Must be one of ${Object.keys(products(accountId)).join(", ")}`
			);
		}

		const source = product.validate(args.source);

		const [destinationService, destinationQueueId] =
			args.destination.split(".");
		if (
			!destinationService ||
			!destinationQueueId ||
			destinationService !== "queues"
		) {
			throw new CommandLineArgsError(
				`Invalid destination. Must be formatted as queues.<queue_id>`
			);
		}
		const destination = { service: "queues", queue_id: destinationQueueId };

		const subscription = await ctx.fetchResult<EventSubscription>(
			ctx.config,
			`/accounts/${accountId}/event_subscriptions/subscriptions`,
			{
				method: "POST",
				body: JSON.stringify({
					name: args.name,
					source,
					destination,
					events: args.events.split(",").map((e) => e.trim()),
				}),
			}
		);

		logger.table([
			{
				id: subscription.id,
				name: subscription.name,
				source: product.format(subscription.source),
				destination: `${subscription.destination.service}.${subscription.destination.queue_id}`,
				events: args.events,
			},
		]);
	},
});

export const eventSubscriptionsUpdateCommand = createCommand({
	metadata: {
		owner: "Product: Queues",
		status: "private-beta",
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
			description: "New name of the subscription",
		},
		destination: {
			type: "string",
			description: "ID of the Queue to send events to",
		},
		events: {
			type: "string",
			description: "Names of events to subscribe to",
		},
	},

	async handler(args, ctx) {
		const accountId = await requireAuth(ctx.config);

		const { id, name, events } = args;

		let destination: EventSubscription["destination"] | undefined = undefined;
		if (args.destination) {
			const [destinationService, destinationQueueId] =
				args.destination.split(".");
			if (
				!destinationService ||
				!destinationQueueId ||
				destinationService !== "queues"
			) {
				throw new CommandLineArgsError(
					`Invalid destination. Must be formatted as queues.<queue_id>`
				);
			}
			destination = { service: "queues", queue_id: destinationQueueId };
		}

		const subscription = await ctx.fetchResult<EventSubscription>(
			ctx.config,
			`/accounts/${accountId}/event_subscriptions/subscriptions/${id}`,
			{
				method: "PATCH",
				body: JSON.stringify({
					name,
					destination,
					events: events?.split(",").map((e) => e.trim()),
				}),
			}
		);

		const product = products(accountId)[subscription.source.service];
		// If this subscription belongs to a product that is not defined in the
		// `products()` object, that means we do not definitively know how to
		// deal with it yet. This will happen when the user is using a Wrangler
		// version that is older than the version where the product was first
		// defined. Instead of crashing / ignoring such subscriptions, we'll
		// try our best to be helpful.
		const source = product
			? product.format(subscription.source)
			: JSON.stringify(subscription.source);

		logger.table([
			{
				id,
				name: subscription.name,
				source,
				destination: `${subscription.destination.service}.${subscription.destination.queue_id}`,
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
		const accountId = await requireAuth(ctx.config);

		const { id } = args;
		await ctx.fetchResult<EventSubscription>(
			ctx.config,
			`/accounts/${accountId}/event_subscriptions/subscriptions/${id}`,
			{ method: "DELETE" }
		);

		logger.log(`Event subscription deleted!`);
	},
});
