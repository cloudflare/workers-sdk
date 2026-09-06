import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { emailListRouting, localExplorerListWorkers } from "../../../api";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { EmailContent } from "../../../components/email/EmailContent";
import {
	EmailHandlerOutcomeWarning,
	hasEmailHandlerException,
} from "../../../components/email/EmailHandlerOutcomeWarning";
import {
	EmailTruncationWarning,
	hasEmailTruncationWarning,
} from "../../../components/email/EmailTruncationWarning";
import { ReceivedEmailHeaders } from "../../../components/email/ReceivedEmailHeaders";
import { NotFound } from "../../../components/NotFound";
import { ResourceError } from "../../../components/ResourceError";
import { getSelectedWorker } from "../../../components/WorkerSelector";
import { ConstantsCard } from "../shared/ConstantsCard";
import { InfoFlow } from "../shared/InfoFlow";
import { InfoLoading } from "../shared/InfoLoading";
import { toEmailId } from "../shared/types";
import type { EmailRoutingDetail } from "../../../api";
import type { InfoEvent, InfoMessage } from "../shared/types";
import type { JSX } from "react";

export const Route = createFileRoute("/email/routing/$emailId")({
	component: EmailRoutingDetailView,
	errorComponent: ResourceError,
	notFoundComponent: NotFound,
	pendingComponent: InfoLoading,
	loaderDeps: ({ search }) => ({ worker: search.worker }),
	loader: async ({ params, deps }) => {
		const workersResponse = await localExplorerListWorkers();
		const worker = getSelectedWorker(
			workersResponse.data?.result ?? [],
			deps.worker === undefined
				? ""
				: `?worker=${encodeURIComponent(deps.worker)}`
		)?.name;
		const response = await emailListRouting({
			query: { email_id: params.emailId, worker },
			throwOnError: false,
		});
		if (response.response?.status === 404) {
			throw notFound();
		}
		const email = response.data?.result;
		if (response.error || !email || Array.isArray(email)) {
			throw new Error(`Failed to load email "${params.emailId}"`);
		}
		const truncated = hasEmailTruncationWarning(
			response.data?.messages ?? [],
			"received"
		);
		const replyTruncated = hasEmailTruncationWarning(
			response.data?.messages ?? [],
			"reply"
		);
		return {
			email,
			replyTruncated,
			truncated,
		};
	},
});

function toInfoMessage(email: EmailRoutingDetail): InfoMessage {
	const emailId = toEmailId(email.messageId);
	const events: InfoEvent[] = email.events.map((event, index) => ({
		id: `${emailId}-${index}`,
		type: event.type,
		timestamp: event.timestamp,
		// `forward`/`reply` events carry a messageId correlating with the full
		// payload; `reject` events carry the message-level reject reason.
		forward:
			event.type === "forward"
				? email.forwards.find((f) => f.messageId === event.messageId)
				: undefined,
		reply:
			event.type === "reply"
				? email.replies.find((r) => r.messageId === event.messageId)
				: undefined,
		rejectReason: event.type === "reject" ? email.rejectReason : undefined,
	}));

	return {
		id: emailId,
		from: email.from,
		to: email.to,
		subject: email.subject,
		messageId: email.messageId,
		receivedAt: email.receivedAt,
		rawSize: email.rawSize,
		attachments: email.attachments,
		recipients: [
			{
				envelopeTos: email.to,
				events,
			},
		],
	};
}

function EmailRoutingDetailView(): JSX.Element {
	const { email, replyTruncated, truncated } = Route.useLoaderData();
	const message = toInfoMessage(email);
	const handlerThrew = hasEmailHandlerException(email);

	return (
		<>
			<Breadcrumbs
				icon={EnvelopeSimpleIcon}
				items={[
					<Link
						className="text-kumo-link hover:underline"
						key="routing"
						search={(prev) => prev}
						to="/email/routing"
					>
						Routing
					</Link>,
					<span className="truncate" key="subject">
						{email.subject || "(no subject)"}
					</span>,
				]}
				title="Email"
			/>

			<div className="space-y-6 px-8 py-6">
				{handlerThrew || replyTruncated ? (
					<div className="space-y-2">
						{handlerThrew ? <EmailHandlerOutcomeWarning /> : null}
						{replyTruncated ? <EmailTruncationWarning kind="reply" /> : null}
					</div>
				) : null}
				<InfoFlow message={message} />
				<ConstantsCard message={message} />
				<ReceivedEmailHeaders
					headers={email.headerEntries ?? Object.entries(email.headers ?? {})}
				/>
				<EmailContent
					html={email.html}
					kind="received"
					previewTitle="Rendered received HTML email body"
					raw={email.raw}
					rawBase64={email.rawBase64}
					text={email.text}
					truncated={truncated}
				/>
			</div>
		</>
	);
}
