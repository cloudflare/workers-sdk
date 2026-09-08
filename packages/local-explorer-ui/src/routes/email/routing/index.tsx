import { Button, Tooltip } from "@cloudflare/kumo";
import {
	EnvelopeSimpleIcon,
	PaperPlaneRightIcon,
	PaperPlaneTiltIcon,
	PencilSimpleIcon,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, type JSX } from "react";
import { emailListRouting, localExplorerListWorkers } from "../../../api";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { EmailList } from "../../../components/email/EmailList";
import { EMAIL_PAGE_SIZE } from "../../../components/email/EmailPagination";
import { SendTestEmailDialog } from "../../../components/email/SendTestEmailDialog";
import { ResourceError } from "../../../components/ResourceError";
import { getSelectedWorker } from "../../../components/WorkerSelector";
import { timeAgo } from "../../../components/workflows/helpers";
import { formatEmailAddress } from "../../../utils/format";
import { useCursorPaginatedList } from "../shared/useCursorPaginatedList";
import {
	getEmailRoutingActionKey,
	useRoutingEmailActions,
} from "../shared/useRoutingEmailActions";
import type { RoutingEmail } from "../shared/useRoutingEmailActions";

export const Route = createFileRoute("/email/routing/")({
	component: EmailRoutingView,
	errorComponent: ResourceError,
	loaderDeps: ({ search }) => ({ worker: search.worker }),
	loader: async ({ deps }) => {
		const workersResponse = await localExplorerListWorkers();
		const worker = getSelectedWorker(
			workersResponse.data?.result ?? [],
			deps.worker === undefined
				? ""
				: `?worker=${encodeURIComponent(deps.worker)}`
		)?.name;
		const response = await emailListRouting({
			query: { per_page: EMAIL_PAGE_SIZE, worker },
			throwOnError: false,
		});
		if (response.error || !response.response.ok) {
			throw new Error(
				response.error?.errors?.[0]?.message ??
					"Failed to load received emails."
			);
		}
		const emails = response.data?.result;
		return {
			emails: Array.isArray(emails) ? emails : [],
			worker,
			nextCursor: response.data?.result_info?.has_more
				? response.data.result_info.cursor
				: undefined,
		};
	},
});

function EmailRoutingView(): JSX.Element {
	const loaderData = Route.useLoaderData();
	const navigate = Route.useNavigate();
	const { worker } = loaderData;

	const fetchEmails = useCallback(
		async (cursor?: string) => {
			const response = await emailListRouting({
				query: { cursor, per_page: EMAIL_PAGE_SIZE, worker },
				throwOnError: false,
			});
			if (response.error || !response.response.ok) {
				throw new Error(
					response.error?.errors?.[0]?.message ??
						"Failed to load received emails."
				);
			}
			const result = response.data?.result;
			return {
				items: Array.isArray(result) ? result : [],
				nextCursor: response.data?.result_info?.has_more
					? response.data.result_info.cursor
					: undefined,
			};
		},
		[worker]
	);
	const initialPage = useMemo(
		() => ({ items: loaderData.emails, nextCursor: loaderData.nextCursor }),
		[loaderData]
	);
	const {
		error: refreshError,
		hasNext,
		hasPrevious,
		items: emails,
		nextPage,
		paging,
		previousPage,
		refresh,
		refreshFirstPage,
		refreshing,
	} = useCursorPaginatedList<RoutingEmail>({
		fetchPage: fetchEmails,
		initialPage,
		pageErrorMessages: {
			next: "Failed to load the next page.",
			previous: "Failed to load the previous page.",
			refresh: "Failed to refresh received emails.",
		},
	});
	const routingActions = useRoutingEmailActions({ refreshFirstPage, worker });

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<Breadcrumbs
				icon={EnvelopeSimpleIcon}
				items={[<span key="routing">Routing</span>]}
				title="Email"
			/>

			<div className="flex min-h-0 w-full flex-1 overflow-hidden border-y border-kumo-fill bg-kumo-base">
				<EmailList
					actions={
						<Button
							onClick={(event) => {
								event.currentTarget.blur();
								routingActions.openBlankComposer();
							}}
							variant="primary"
						>
							<PaperPlaneTiltIcon size={14} weight="fill" />
							Send test email
						</Button>
					}
					className="flex-1"
					disabled={paging || refreshing}
					emptyState={
						<>
							No emails received yet. Use &ldquo;Send test email&rdquo; to
							deliver one. Email capture only works when the selected Worker has
							an email() handler configured.
						</>
					}
					error={refreshError}
					getRow={(email, index) => {
						const captureId = email.captureId;
						const rowWorker = email.worker;
						return {
							id:
								captureId && rowWorker
									? getEmailRoutingActionKey(rowWorker, captureId)
									: `summary\u0000${rowWorker ?? ""}\u0000${email.messageId}\u0000${email.receivedAt}\u0000${index}`,
							navigable: Boolean(captureId && rowWorker),
							navigationId: captureId,
							primary: email.subject || "(no subject)",
							secondary: `${formatEmailAddress(email.from)} → ${formatEmailAddress(email.to)}`,
							secondaryTitle: `From: ${formatEmailAddress(email.from)}; To: ${formatEmailAddress(email.to)}`,
							timestamp: timeAgo(email.receivedAt) || "—",
							warning:
								email.outcome === "exception"
									? "Email processing exception"
									: undefined,
						};
					}}
					hasNext={hasNext}
					hasPrevious={hasPrevious}
					items={emails}
					onNext={() => void nextPage()}
					onPrevious={() => void previousPage()}
					onRefresh={() => void refresh()}
					onRowClick={(captureId, email) => {
						void navigate({
							params: { captureId },
							search: (previous) => ({
								...previous,
								worker: email.worker,
							}),
							to: "/email/routing/$captureId",
						});
					}}
					refreshing={refreshing}
					renderRowActions={(email) => {
						const captureId = email.captureId;
						const rowWorker = email.worker;
						if (!captureId || !rowWorker) {
							return null;
						}
						const actionState = routingActions.getRowActionState(email);
						const loading = actionState !== "idle";
						const editAvailable = email.editAndResendAvailable === true;
						const editExplanation = editAvailable
							? "Edit and resend"
							: (email.editAndResendUnavailableReason ??
								"This capture cannot be edited and resent.");
						const resendExplanation = email.capturedPortion
							? "Resend. Only the captured portion of the original email is available."
							: "Resend";
						return (
							<div className="flex shrink-0 items-center gap-1 pr-2">
								<Tooltip asChild content={editExplanation}>
									<Button
										aria-disabled={!editAvailable || undefined}
										aria-label="Edit and resend"
										className={
											editAvailable
												? undefined
												: "cursor-not-allowed text-kumo-subtle opacity-50 hover:bg-inherit"
										}
										disabled={loading}
										loading={actionState === "projecting"}
										onClick={() => {
											if (editAvailable && !loading) {
												void routingActions.editAndResend(email);
											}
										}}
										shape="square"
										variant="ghost"
									>
										<PencilSimpleIcon size={16} />
									</Button>
								</Tooltip>
								<Tooltip asChild content={resendExplanation}>
									<Button
										aria-label="Resend"
										disabled={loading}
										loading={actionState === "resending"}
										onClick={() => {
											if (!loading) {
												void routingActions.resend(email);
											}
										}}
										shape="square"
										variant="ghost"
									>
										<PaperPlaneRightIcon size={16} />
									</Button>
								</Tooltip>
							</div>
						);
					}}
				/>
			</div>

			<SendTestEmailDialog
				initialDraft={routingActions.dialogDraft}
				key={routingActions.workerGeneration}
				onDispatchedSendSettled={routingActions.requestInboxRefresh}
				onOpenChange={routingActions.handleDialogOpenChange}
				open={routingActions.dialogOpen}
				worker={routingActions.dialogWorker}
				workerGeneration={routingActions.workerGeneration}
			/>
		</div>
	);
}
