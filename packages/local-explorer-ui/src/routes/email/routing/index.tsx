import { Button } from "@cloudflare/kumo";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState, type JSX } from "react";
import { emailListRouting, localExplorerListWorkers } from "../../../api";
import EmailIcon from "../../../assets/icons/email.svg?react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { EmailList } from "../../../components/email/EmailList";
import { EMAIL_PAGE_SIZE } from "../../../components/email/EmailPagination";
import { SendTestEmailDialog } from "../../../components/email/SendTestEmailDialog";
import { ResourceError } from "../../../components/ResourceError";
import { getSelectedWorker } from "../../../components/WorkerSelector";
import { timeAgo } from "../../../components/workflows/helpers";
import { toEmailId } from "../shared/types";
import { useCursorPaginatedList } from "../shared/useCursorPaginatedList";
import type { EmailRoutingItem } from "../../../api";

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
		});
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
	const [dialogOpen, setDialogOpen] = useState<boolean>(false);

	const fetchEmails = useCallback(
		async (cursor?: string) => {
			const response = await emailListRouting({
				query: { cursor, per_page: EMAIL_PAGE_SIZE, worker },
			});
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
		refreshing,
	} = useCursorPaginatedList<EmailRoutingItem>({
		fetchPage: fetchEmails,
		initialPage,
		pageErrorMessages: {
			next: "Failed to load the next page.",
			previous: "Failed to load the previous page.",
			refresh: "Failed to refresh received emails.",
		},
	});

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<Breadcrumbs
				icon={EmailIcon}
				items={[<span key="routing">Routing</span>]}
				title="Email"
			/>

			<div className="flex min-h-0 w-full flex-1 overflow-hidden border-y border-kumo-fill bg-kumo-base">
				<EmailList
					actions={
						<Button
							onClick={(e) => {
								e.currentTarget.blur();
								setDialogOpen(true);
							}}
							variant="primary"
						>
							<PaperPlaneTiltIcon size={14} weight="fill" />
							Send Test Email
						</Button>
					}
					className="flex-1"
					disabled={paging || refreshing}
					emptyState={
						<>
							No emails received yet. Use &ldquo;Send Test Email&rdquo; to
							deliver one to the email() handler.
						</>
					}
					error={refreshError}
					getRow={(email) => ({
						id: toEmailId(email.messageId),
						primary: email.subject || "(no subject)",
						secondary: `${email.from} → ${email.to}`,
						secondaryTitle: `From: ${email.from}; To: ${email.to}`,
						timestamp: timeAgo(email.receivedAt) || "—",
					})}
					hasNext={hasNext}
					hasPrevious={hasPrevious}
					items={emails}
					onNext={() => void nextPage()}
					onPrevious={() => void previousPage()}
					onRefresh={() => void refresh()}
					onRowClick={(emailId) => {
						void navigate({
							params: { emailId },
							search: (previous) => previous,
							to: "/email/routing/$emailId",
						});
					}}
					refreshing={refreshing}
				/>
			</div>

			<SendTestEmailDialog
				onOpenChange={setDialogOpen}
				onSent={() => void refresh()}
				open={dialogOpen}
				worker={worker}
			/>
		</div>
	);
}
