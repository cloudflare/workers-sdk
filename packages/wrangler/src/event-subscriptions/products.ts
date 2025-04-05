import type { HandlerContext } from "../core/types";

// Use the same `id` here as the one you used in queue-broker-worker
export const PRODUCTS: ProductSpec[] = [
	{
		id: "clipboards",
		name: "Clipboards",
		resource: { name: "clipboard" },
		subscription: {
			create: (
				ctx,
				{ accountId, name, resourceId: clipboardId, queueId, events }
			) =>
				ctx.fetchResult<{ id: string }>(
					`/accounts/${accountId}/clipboard/subscriptions`,
					{
						method: "POST",
						body: JSON.stringify({
							name,
							clipboardId,
							queueId,
							events,
						}),
					}
				),
		},
	},
	{
		id: "workersAI",
		name: "Workers AI",
		resource: null,
		subscription: {
			create: () => Promise.resolve({ id: "" }),
		},
	},
	{
		id: "workersBuilds",
		name: "Workers Builds",
		resource: { name: "Worker" },
		subscription: {
			create: () => Promise.resolve({ id: "" }),
		},
	},
	{
		id: "workflows",
		name: "Workflows",
		resource: { name: "Workflow" },
		subscription: {
			create: () => Promise.resolve({ id: "" }),
		},
	},
];

/////////////////////////////////////////
// No modifications beyond this please //
/////////////////////////////////////////

export type ProductSpec = {
	id: string;
	name: string;
	resource: { name: string } | null;
	subscription: {
		create: (
			ctx: HandlerContext,
			args: {
				accountId: string;
				name: string;
				resourceId: string;
				queueId: string;
				events: string[];
			}
		) => Promise<{ id: string }>;
	};
};
