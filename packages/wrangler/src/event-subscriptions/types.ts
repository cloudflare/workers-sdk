import type { EventSubscription } from "./products";

export type EventHubSource = EventSubscription["source"];
export type EventHubProductId = EventHubSource["service"];
export type EventHubProductSpec<S = EventHubSource> = {
	/**
	 * @argument source: The --source argument input by the user
	 *
	 * @returns The `source` property to send in the "Create Event Subscription"
	 * request. The expected shape is documented
	 * This is the same shape as the `source` Zod discriminated union you appended
	 * to when you onboarded your service schema in the Queues codebase.
	 */
	validate: (source: string) => S;
	/**
	 * @argument source: The `source` property from the Event Subscription
	 * response
	 *
	 * @returns A string that can be displayed to the user when listing
	 * subscriptions. This should generally be in the format <ProductID>.<ResourceID>
	 */
	format: (source: S) => string;
};
