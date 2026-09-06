import { Button } from "@cloudflare/kumo";
import { ArrowsClockwiseIcon, WarningIcon } from "@phosphor-icons/react";
import { EmailPagination } from "./EmailPagination";
import type { CSSProperties, JSX, ReactNode } from "react";

export interface EmailListRow {
	id: string;
	primary: string;
	secondary: string;
	secondaryTitle: string;
	timestamp: string;
	warning?: string;
}

interface EmailListProps<T> {
	actions?: ReactNode;
	className?: string;
	disabled: boolean;
	emptyState: ReactNode;
	error: string | null;
	getRow: (item: T) => EmailListRow;
	hasNext: boolean;
	hasPrevious: boolean;
	items: T[];
	onNext: () => void;
	onPrevious: () => void;
	onRefresh: () => void;
	onRowClick: (id: string) => void;
	refreshing: boolean;
	selectedId?: string | null;
	style?: CSSProperties;
	testId?: string;
}

/** Renders the common received- and sent-email list layout. */
export function EmailList<T>({
	actions,
	className = "",
	disabled,
	emptyState,
	error,
	getRow,
	hasNext,
	hasPrevious,
	items,
	onNext,
	onPrevious,
	onRefresh,
	onRowClick,
	refreshing,
	selectedId,
	style,
	testId,
}: EmailListProps<T>): JSX.Element {
	return (
		<section
			className={`flex min-w-0 flex-col overflow-hidden px-4 py-3 ${className}`}
			data-testid={testId}
			style={style}
		>
			<div className="mb-2 flex shrink-0 items-center justify-between">
				<div className="flex items-center gap-2">
					{actions}
					<Button
						aria-label="Refresh"
						disabled={refreshing}
						onClick={onRefresh}
						shape="square"
						variant="secondary"
					>
						<ArrowsClockwiseIcon
							className={refreshing ? "animate-spin" : ""}
							size={18}
						/>
					</Button>
				</div>
				<EmailPagination
					disabled={disabled}
					hasNext={hasNext}
					hasPrevious={hasPrevious}
					onNext={onNext}
					onPrevious={onPrevious}
				/>
			</div>

			{error && (
				<div
					className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
					role="alert"
				>
					{error}
				</div>
			)}

			{items.length === 0 ? (
				<div className="rounded-lg border border-kumo-fill bg-kumo-elevated px-5 py-8 text-center text-sm text-kumo-subtle">
					{emptyState}
				</div>
			) : (
				<div className="min-h-0 w-full flex-1 overflow-y-auto">
					<div className="flex flex-col items-stretch overflow-hidden rounded-lg border border-kumo-fill bg-kumo-base">
						{items.map((item) => {
							const row = getRow(item);
							const selected = selectedId === row.id;
							return (
								<button
									aria-pressed={selectedId === undefined ? undefined : selected}
									className={`grid h-12 min-h-12 w-full shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 border-b border-kumo-fill px-4 text-left text-sm last:border-b-0 hover:bg-kumo-fill ${
										selected ? "bg-kumo-fill" : "bg-kumo-base"
									}`}
									key={row.id}
									onClick={() => onRowClick(row.id)}
									type="button"
								>
									<span className="flex min-w-0 items-center gap-2">
										{row.warning ? (
											<span
												aria-label={row.warning}
												className="flex h-lh shrink-0 items-center text-kumo-danger"
												role="img"
												title={row.warning}
											>
												<WarningIcon aria-hidden="true" size={16} />
											</span>
										) : null}
										<span
											className="truncate font-medium text-kumo-default"
											title={row.primary}
										>
											{row.primary}
										</span>
									</span>
									<span
										className="truncate text-kumo-subtle"
										title={row.secondaryTitle}
									>
										{row.secondary}
									</span>
									<span className="shrink-0 text-kumo-subtle">
										{row.timestamp}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			)}
		</section>
	);
}
