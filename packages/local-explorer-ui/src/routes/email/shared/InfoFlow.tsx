import { Flow, LayerCard } from "@cloudflare/kumo";
import { EventNode } from "./EventNode";
import type { InfoMessage } from "./types";

interface InfoFlowProps {
	message: InfoMessage;
}

/**
 * Renders the message lifecycle as a Kumo `<Flow>`.
 *
 * - **Single recipient** (every routing message) → flat top-to-bottom
 *   sequence: one `<Flow.Node>` per event in ascending timestamp order.
 *
 * Defensive empty-state: if the message has zero recipients
 * (or every recipient has zero events) we render the empty card text
 * instead of an unconnected diagram.
 */
export function InfoFlow({ message }: InfoFlowProps) {
	const recipients = message.recipients.filter((r) => r.events.length > 0);
	const [firstRecipient] = recipients;

	if (firstRecipient === undefined) {
		return (
			<LayerCard>
				<LayerCard.Secondary>Lifecycle</LayerCard.Secondary>
				<LayerCard.Primary>
					<div className="text-center text-sm text-kumo-subtle">
						Message not found
					</div>
				</LayerCard.Primary>
			</LayerCard>
		);
	}

	return (
		<LayerCard>
			<LayerCard.Secondary>Lifecycle</LayerCard.Secondary>
			<LayerCard.Primary className="p-0">
				<div className="rounded-b-lg bg-[radial-gradient(var(--color-kumo-subtle)_1px,transparent_1px)] bg-size-[16px_16px] p-4">
					<Flow>
						{firstRecipient.events.map((event) => (
							<EventNode key={event.id} event={event} />
						))}
					</Flow>
				</div>
			</LayerCard.Primary>
		</LayerCard>
	);
}
