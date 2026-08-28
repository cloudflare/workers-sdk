import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import {
	createFileRoute,
	getRouteApi,
	useRouterState,
} from "@tanstack/react-router";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type JSX,
} from "react";
import { emailListSending, localExplorerListWorkers } from "../../api";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { EmailList } from "../../components/email/EmailList";
import { EMAIL_PAGE_SIZE } from "../../components/email/EmailPagination";
import { EmailServiceEmptyState } from "../../components/email/EmailServiceEmptyState";
import { hasEmailTruncationWarning } from "../../components/email/EmailTruncationWarning";
import { SentEmailDetails } from "../../components/email/SentEmailDetails";
import { ResourceError } from "../../components/ResourceError";
import { getSelectedWorker } from "../../components/WorkerSelector";
import { timeAgo } from "../../components/workflows/helpers";
import { formatEmailAddress } from "../../utils/format";
import { toEmailId } from "./shared/types";
import { useCursorPaginatedList } from "./shared/useCursorPaginatedList";
import type { EmailSendingDetail, EmailSendingItem } from "../../api";

export const Route = createFileRoute("/email/sending")({
	component: EmailSendingView,
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
		const response = await emailListSending({
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

const rootRoute = getRouteApi("__root__");

function EmailSendingView(): JSX.Element {
	const loaderData = Route.useLoaderData();
	const rootData = rootRoute.useLoaderData();
	const routerState = useRouterState();
	const { worker } = loaderData;

	const [selected, setSelected] = useState<EmailSendingDetail | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
	const [detailsTruncated, setDetailsTruncated] = useState<boolean>(false);
	const [detailError, setDetailError] = useState<string | null>(null);
	const detailRequest = useRef<number>(0);

	// The "Sending" view requires at least one send_email binding on the
	// selected worker. Without one, there is no sending service to show.
	const hasSendingService = useMemo(() => {
		const selectedWorker = getSelectedWorker(
			rootData.workers,
			routerState.location.searchStr
		);
		return (selectedWorker?.bindings?.sendEmail?.length ?? 0) > 0;
	}, [rootData.workers, routerState.location.searchStr]);

	useEffect(() => {
		detailRequest.current += 1;
		setSelected(null);
		setSelectedId(null);
		setLoadingDetails(false);
		setDetailsTruncated(false);
		setDetailError(null);
	}, [loaderData]);

	useEffect(() => {
		detailRequest.current += 1;
		setSelected(null);
		setSelectedId(null);
		setLoadingDetails(false);
		setDetailsTruncated(false);
		setDetailError(null);
	}, [worker]);

	const fetchEmails = useCallback(
		async (cursor?: string) => {
			const response = await emailListSending({
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

	const clearSelection = useCallback(() => {
		detailRequest.current += 1;
		setSelected(null);
		setSelectedId(null);
		setLoadingDetails(false);
		setDetailsTruncated(false);
		setDetailError(null);
	}, []);
	const initialPage = useMemo(
		() => ({ items: loaderData.emails, nextCursor: loaderData.nextCursor }),
		[loaderData]
	);
	const {
		error: listError,
		hasNext,
		hasPrevious,
		items: emails,
		nextPage,
		paging,
		previousPage,
		refresh,
		refreshing,
	} = useCursorPaginatedList<EmailSendingItem>({
		fetchPage: fetchEmails,
		initialPage,
		onPageChange: clearSelection,
		pageErrorMessages: {
			next: "Failed to load the next page.",
			previous: "Failed to load the previous page.",
			refresh: "Failed to refresh sent emails.",
		},
	});
	const handleRefresh = useCallback(async () => {
		setDetailError(null);
		await refresh();
	}, [refresh]);
	const error = detailError ?? listError;

	async function handleRowClick(emailId: string): Promise<void> {
		if (selectedId === emailId) {
			detailRequest.current += 1;
			setSelectedId(null);
			setSelected(null);
			setLoadingDetails(false);
			setDetailsTruncated(false);
			setDetailError(null);
			return;
		}

		const request = detailRequest.current + 1;
		detailRequest.current = request;
		setDetailError(null);
		setSelectedId(emailId);
		setSelected(null);
		setLoadingDetails(true);
		setDetailsTruncated(false);
		try {
			const response = await emailListSending({
				query: { email_id: emailId, worker },
			});
			const email = response.data?.result;
			if (request === detailRequest.current && email && !Array.isArray(email)) {
				setSelected(email);
				setDetailsTruncated(
					hasEmailTruncationWarning(response.data?.messages ?? [], "sent")
				);
			}
		} catch (e) {
			if (request !== detailRequest.current) {
				return;
			}
			setSelectedId(null);
			// Surface the failure instead of silently dropping the click.
			setDetailError(
				e instanceof Error ? e.message : "Failed to load the sent email."
			);
		} finally {
			if (request === detailRequest.current) {
				setLoadingDetails(false);
			}
		}
	}

	if (!hasSendingService) {
		return (
			<>
				<Breadcrumbs
					icon={EnvelopeSimpleIcon}
					items={[<span key="sending">Sending</span>]}
					title="Email"
				/>
				<EmailServiceEmptyState
					title="No sending service"
					description="This worker has no Send Email bindings configured. Add a send_email binding to your Wrangler configuration to send emails from this worker."
				/>
			</>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<Breadcrumbs
				icon={EnvelopeSimpleIcon}
				items={[<span key="sending">Sending</span>]}
				title="Email"
			/>

			<div className="[container-type:inline-size] flex min-h-0 w-full flex-1 overflow-hidden border-y border-kumo-fill bg-kumo-base">
				<EmailList
					className={`flex-none transition-[flex-basis] duration-300 ease-in-out ${
						selectedId === null ? "" : "border-r border-kumo-fill"
					}`}
					disabled={paging || refreshing}
					emptyState="No emails sent yet. Messages sent via a send_email binding will appear here."
					error={error}
					getRow={(email) => ({
						id: toEmailId(email.messageId),
						primary: email.subject || "(no subject)",
						secondary: email.to.map(formatEmailAddress).join(", "),
						secondaryTitle: `To: ${email.to.map(formatEmailAddress).join(", ")}`,
						timestamp: timeAgo(email.sentAt) || "—",
					})}
					hasNext={hasNext}
					hasPrevious={hasPrevious}
					items={emails}
					onNext={() => void nextPage()}
					onPrevious={() => void previousPage()}
					onRefresh={() => void handleRefresh()}
					onRowClick={(emailId) => void handleRowClick(emailId)}
					refreshing={refreshing}
					selectedId={selectedId}
					style={{ flexBasis: selectedId === null ? "100%" : "50%" }}
					testId="sent-email-list"
				/>
				<section
					aria-hidden={selectedId === null}
					className={`min-w-0 flex-none overflow-hidden transition-[flex-basis,transform,opacity] duration-300 ease-in-out ${
						selectedId === null
							? "pointer-events-none translate-x-full opacity-0"
							: "translate-x-0 opacity-100"
					}`}
					data-testid="sent-email-details"
					inert={selectedId === null}
					style={{ flexBasis: selectedId === null ? "0%" : "50%" }}
				>
					{/* Preserve the open content width while the clipping pane collapses. */}
					<div className="h-full w-[50cqw] shrink-0">
						<SentEmailDetails
							email={selected}
							loading={loadingDetails}
							truncated={detailsTruncated}
						/>
					</div>
				</section>
			</div>
		</div>
	);
}
