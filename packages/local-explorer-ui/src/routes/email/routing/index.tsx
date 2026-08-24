import { Button } from "@cloudflare/kumo";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { emailListRouting, localExplorerListWorkers } from "../../../api";
import EmailIcon from "../../../assets/icons/email.svg?react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import {
	EMAIL_PAGE_SIZE,
	EmailPagination,
} from "../../../components/email/EmailPagination";
import { ResourceError } from "../../../components/ResourceError";
import { getSelectedWorker } from "../../../components/WorkerSelector";
import { timeAgo } from "../../../components/workflows/helpers";
import { withMinimumDelay } from "../../../utils/async";
import { toEmailId } from "../shared/types";
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
	const { worker } = loaderData;
	const listRequest = useRef<number>(0);

	const [emails, setEmails] = useState<EmailRoutingItem[]>(loaderData.emails);
	const [currentCursor, setCurrentCursor] = useState<string | undefined>();
	const [nextCursor, setNextCursor] = useState<string | undefined>(
		loaderData.nextCursor
	);
	const [previousCursors, setPreviousCursors] = useState<
		Array<string | undefined>
	>([]);
	const [paging, setPaging] = useState<boolean>(false);
	const [refreshing, setRefreshing] = useState<boolean>(false);
	const [refreshError, setRefreshError] = useState<string | null>(null);

	useEffect(() => {
		listRequest.current += 1;
		setEmails(loaderData.emails);
		setCurrentCursor(undefined);
		setNextCursor(loaderData.nextCursor);
		setPreviousCursors([]);
	}, [loaderData]);

	useEffect(() => {
		listRequest.current += 1;
	}, [worker]);

	const fetchEmails = useCallback(
		async (cursor?: string): Promise<boolean> => {
			const request = listRequest.current + 1;
			listRequest.current = request;
			const response = await emailListRouting({
				query: { cursor, per_page: EMAIL_PAGE_SIZE, worker },
			});
			if (request !== listRequest.current) {
				return false;
			}
			const result = response.data?.result;
			setEmails(Array.isArray(result) ? result : []);
			setNextCursor(
				response.data?.result_info?.has_more
					? response.data.result_info.cursor
					: undefined
			);
			return true;
		},
		[worker]
	);

	const handleRefresh = useCallback(async () => {
		setRefreshing(true);
		setRefreshError(null);
		try {
			await withMinimumDelay(fetchEmails(currentCursor));
		} catch (e) {
			// Keep the existing rows and surface the failure rather than leaving an
			// unhandled rejection or silently doing nothing.
			setRefreshError(
				e instanceof Error ? e.message : "Failed to refresh received emails."
			);
		} finally {
			setRefreshing(false);
		}
	}, [currentCursor, fetchEmails]);

	async function handleNextPage(): Promise<void> {
		if (!nextCursor) {
			return;
		}
		setPaging(true);
		setRefreshError(null);
		try {
			if (!(await fetchEmails(nextCursor))) {
				return;
			}
			setPreviousCursors((cursors) => [...cursors, currentCursor]);
			setCurrentCursor(nextCursor);
		} catch (e) {
			setRefreshError(
				e instanceof Error ? e.message : "Failed to load the next page."
			);
		} finally {
			setPaging(false);
		}
	}

	async function handlePreviousPage(): Promise<void> {
		const previousCursor = previousCursors.at(-1);
		if (previousCursors.length === 0) {
			return;
		}
		setPaging(true);
		setRefreshError(null);
		try {
			if (!(await fetchEmails(previousCursor))) {
				return;
			}
			setPreviousCursors((cursors) => cursors.slice(0, -1));
			setCurrentCursor(previousCursor);
		} catch (e) {
			setRefreshError(
				e instanceof Error ? e.message : "Failed to load the previous page."
			);
		} finally {
			setPaging(false);
		}
	}

	return (
		<>
			<Breadcrumbs
				icon={EmailIcon}
				items={[<span key="routing">Routing</span>]}
				title="Email"
			/>

			<div className="px-8 py-6">
				<div className="mb-4 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Button
							aria-label="Refresh"
							disabled={refreshing}
							onClick={() => void handleRefresh()}
							shape="square"
							variant="secondary"
						>
							<ArrowsClockwiseIcon
								size={18}
								className={refreshing ? "animate-spin" : ""}
							/>
						</Button>
					</div>
				</div>

				{refreshError && (
					<div
						className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
						role="alert"
					>
						{refreshError}
					</div>
				)}

				{emails.length === 0 ? (
					<div className="rounded-lg border border-kumo-fill bg-kumo-elevated px-5 py-8 text-center text-sm text-kumo-subtle">
						No emails received yet.
					</div>
				) : (
					<div className="overflow-hidden rounded-lg border border-kumo-fill bg-kumo-base">
						{emails.map((email) => (
							<Link
								className="grid h-12 cursor-pointer grid-cols-[1fr_1fr_2fr_auto] items-center gap-3 border-b border-kumo-fill px-4 transition-colors last:border-b-0 hover:bg-kumo-fill"
								key={email.messageId}
								params={{ emailId: toEmailId(email.messageId) }}
								search={(prev) => prev}
								to="/email/routing/$emailId"
							>
								<span className="truncate text-sm text-kumo-default">
									{email.from}
								</span>
								<span className="truncate text-sm text-kumo-subtle">
									{email.to}
								</span>
								<span className="truncate text-sm text-kumo-default">
									{email.subject || "(no subject)"}
								</span>
								<span className="text-right text-xs text-kumo-subtle">
									{timeAgo(email.receivedAt) || "—"}
								</span>
							</Link>
						))}
					</div>
				)}

				<EmailPagination
					disabled={paging || refreshing}
					hasNext={nextCursor !== undefined}
					hasPrevious={previousCursors.length > 0}
					onNext={() => void handleNextPage()}
					onPrevious={() => void handlePreviousPage()}
				/>
			</div>
		</>
	);
}
