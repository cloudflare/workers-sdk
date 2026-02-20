import { Button, InputGroup } from "@cloudflare/kumo";
import {
	ArrowsCounterClockwiseIcon,
	CaretLeftIcon,
	CaretRightIcon,
	ListNumbersIcon,
	PlusIcon,
	SpinnerIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	buildStudioMutationPlans,
	commitStudioTableChanges,
} from "../../../utils/studio/commit";
import { useStudioContext } from "../Context";
import { useModal } from "../Modal";
import { StudioCommitConfirmation } from "../Modal/CommitConfirmation";
import { StudioDeleteConfirmationModal } from "../Modal/DeleteConfirmation";
import { StudioQueryResultStats } from "../Query/ResultStats";
import { createStudioTableStateFromResult } from "../Table/State/Helpers";
import { useStudioCurrentWindowTab } from "../WindowTab/Context";
import type {
	StudioResultStat,
	StudioSortDirection,
	StudioTableSchema,
} from "../../../types/studio";
import type { StudioTableState } from "../Table/State";
import type { StudioResultHeaderMetadata } from "../Table/State/Helpers";

interface StudioTableExplorerTabProps {
	schemaName: string;
	tableName: string;
}

const DEFAULT_PAGE_SIZE = 50;

export function StudioTableExplorerTab({
	schemaName,
	tableName,
}: StudioTableExplorerTabProps): JSX.Element {
	const { driver, schemas } = useStudioContext();

	const [changeNumber, setChangeNumber] = useState<number>(0);
	const [error, setError] = useState<string>("");
	const [hasNextPage, setHasNextPage] = useState<boolean>(false);
	const [loading, setLoading] = useState<boolean>(true);
	const [orderBy, setOrderBy] = useState<{
		columName: string;
		direction: StudioSortDirection;
	}>();
	const [pageLimit, setPageLimit] = useState<number>(DEFAULT_PAGE_SIZE);
	const [pageLimitInput, setPageLimitInput] = useState<string>(
		DEFAULT_PAGE_SIZE.toString()
	);
	const [pageOffset, setPageOffset] = useState<number>(0);
	const [pageOffsetInput, setPageOffsetInput] = useState<string>("0");
	const [queryStats, setQueryStats] = useState<StudioResultStat>();
	const [schema, setSchema] = useState<StudioTableSchema>();
	const [state, setState] =
		useState<StudioTableState<StudioResultHeaderMetadata>>();
	const [whereRaw, setWhereRaw] = useState<string>("");

	const { openModal } = useModal();

	// @ts-expect-error TODO: Re-enable in a later PR
	const _filterAutoCompleteColumns = useMemo<string[]>(() => {
		if (!schema) {
			return [];
		}

		const autoCompleteColumns = schema.columns.map((column) => column.name);

		// This is necessary for FTS5 tables, as the search syntax is "{table_name} MATCH 'your_search'".
		// Without this, this syntax is not valid, making the search pretty useless for full text search tables.
		if (schema.fts5 && schema.tableName) {
			autoCompleteColumns.push(schema.tableName);
		}

		return autoCompleteColumns;
	}, [schema]);

	const { setDirtyState, setBeforeTabClosingHandler } =
		useStudioCurrentWindowTab();

	// This effect subscribes to the external table state's change event and syncs
	// the change count into React state. The initial synchronous setState is valid
	// setup before subscribing to the external store.
	useEffect(() => {
		if (state) {
			setChangeNumber(state.getChangedRows().length);

			return state.addChangeListener(() => {
				setChangeNumber(state.getChangedRows().length);
			});
		}
	}, [state, setDirtyState]);

	const removedRowsCount = state
		? state
				.getChangedRows()
				.reduce((acc, row) => (row.isRemoved ? acc + 1 : acc), 0)
		: 0;

	// Mark the current tab as dirty if there are unsaved changes
	useEffect((): void => {
		setDirtyState(changeNumber > 0);
	}, [setDirtyState, changeNumber]);

	// Prompt the user before closing the tab if there are unsaved changes
	useEffect((): void => {
		setBeforeTabClosingHandler((currentTab) => {
			if (currentTab.isDirty) {
				return confirm(
					"You have unsaved changes. Do you want to close without saving?"
				);
			}

			return true;
		});
	}, [setBeforeTabClosingHandler]);

	const onRefreshClicked = useCallback(async (): Promise<void> => {
		if (!schemas) {
			return;
		}

		setLoading(true);
		setError("");

		try {
			const { result, schema: fetchedSchema } = await driver.selectTable(
				schemaName,
				tableName,
				{
					limit: pageLimit + 1, // We try to get 1 more than limit so we can decide if there is next page
					offset: pageOffset,
					orderByColumn: orderBy?.columName,
					orderByDirection: orderBy?.direction,
					whereRaw,
				}
			);

			// Fetch one extra row to check if a next page exists.
			// If more than `pageLimit` rows are returned, we know there's another page.
			// Then trim the result back down to the actual page size.
			setHasNextPage(result.rows.length > pageLimit);
			setQueryStats(result.stat);
			result.rows = result.rows.slice(0, pageLimit);

			setState(
				createStudioTableStateFromResult({
					driver,
					result,
					rowNumberOffset: pageOffset,
					schemas,
					tableSchema: fetchedSchema,
				})
			);

			setSchema(fetchedSchema);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [
		driver,
		orderBy,
		pageLimit,
		pageOffset,
		schemaName,
		schemas,
		tableName,
		whereRaw,
	]);

	useEffect((): void => {
		void onRefreshClicked();
	}, [onRefreshClicked]);

	// @ts-expect-error TODO: Re-enable in a later PR
	const _headerIndexList = useMemo((): number[] => {
		if (!schema) {
			return [];
		}

		return Array.from({ length: schema.columns.length }, (_, k) => k);
	}, [schema]);

	/**
	 * Executes a callback only after confirming discard of unsaved changes.
	 * If there are unsaved changes, shows a confirmation modal first.
	 */
	const guardUnsavedChanges = useCallback(
		(confirmCallback: () => void, cancelCallback?: () => void): void => {
			if (changeNumber > 0) {
				// The onConfirm and onClose handlers are both triggered by the modal,
				// so we use a flag isClosingAfterConfirm to distinguish whether the modal
				// was closed by confirming or by canceling.
				let isClosingAfterConfirm = false;

				openModal(StudioDeleteConfirmationModal, {
					body: (
						<p>
							You have unsaved changes. Are you sure you want to discard them?
						</p>
					),
					confirmationText: "Discard Changes",
					onConfirm: async () => {
						confirmCallback();
						isClosingAfterConfirm = true;
					},
					onClose: () => {
						// Only trigger cancel callback if modal was closed without confirmation
						if (!isClosingAfterConfirm) {
							cancelCallback?.();
						}
					},
					title: "Discard Unsaved Changes?",
				});
			} else {
				confirmCallback();
			}
		},
		[openModal, changeNumber]
	);

	const onOffsetBlur = useCallback(
		(e: React.FocusEvent<HTMLInputElement>): void => {
			const raw = e.currentTarget.value.trim();
			const offsetValue = Number(raw);
			const clampedOffset = Math.max(
				0,
				Number.isFinite(offsetValue) ? offsetValue : 0
			);

			if (pageOffset !== clampedOffset) {
				guardUnsavedChanges(
					() => {
						setPageOffset(clampedOffset);
						setPageOffsetInput(clampedOffset.toString());
					},
					() => {
						setPageOffsetInput(pageOffset.toString());
					}
				);
			} else {
				setPageOffsetInput(clampedOffset.toString());
			}
		},
		[pageOffset, guardUnsavedChanges]
	);

	const onLimitBlur = useCallback(
		(e: React.FocusEvent<HTMLInputElement>): void => {
			const raw = e.currentTarget.value.trim();
			const limitValue = Number(raw);
			const clampedLimit = Math.max(
				1,
				Number.isFinite(limitValue) ? limitValue : 1
			);

			if (pageLimit !== clampedLimit) {
				guardUnsavedChanges(
					() => {
						setPageLimit(clampedLimit);
						setPageLimitInput(clampedLimit.toString());
					},
					() => {
						setPageLimitInput(pageLimit.toString());
					}
				);
			} else {
				setPageLimitInput(clampedLimit.toString());
			}
		},
		[pageLimit, guardUnsavedChanges]
	);

	const onPageNext = useCallback((): void => {
		guardUnsavedChanges(() => {
			const clampedOffset = Math.max(pageOffset + pageLimit, 0);
			setPageOffset(clampedOffset);
			setPageOffsetInput(clampedOffset.toString());
		});
	}, [pageOffset, pageLimit, guardUnsavedChanges]);

	const onPagePrevious = useCallback((): void => {
		guardUnsavedChanges(() => {
			const clampedOffset = Math.max(pageOffset - pageLimit, 0);
			setPageOffset(clampedOffset);
			setPageOffsetInput(clampedOffset.toString());
		});
	}, [pageOffset, pageLimit, guardUnsavedChanges]);

	// @ts-expect-error TODO: Re-enable in a later PR
	const _onWhereRawApplied = useCallback(
		(newWhereRaw: string): void => {
			guardUnsavedChanges(() => {
				setWhereRaw(newWhereRaw);

				// Reset the pagination when apply new filter
				setPageOffset(0);
				setPageOffsetInput("0");
				setPageLimitInput(DEFAULT_PAGE_SIZE.toString());
				setPageLimit(DEFAULT_PAGE_SIZE);
			});
		},
		[guardUnsavedChanges]
	);

	const onAddRowClick = useCallback((): void => {
		if (state) {
			state.insertNewRow();
		}
	}, [state]);

	const onDeleteRowClick = useCallback((): void => {
		if (state) {
			state.getSelectedRowIndex().map((rowIndex) => state.removeRow(rowIndex));
		}
	}, [state]);

	const onDiscardClick = useCallback((): void => {
		if (state) {
			state.discardAllChange();
		}
	}, [state]);

	const onCommit = useCallback((): void => {
		if (!schema || !state) {
			return;
		}

		try {
			const plans = buildStudioMutationPlans({
				data: state,
				tableSchema: schema,
			});

			openModal(StudioCommitConfirmation, {
				onClose: () => {},
				onConfirm: async (): Promise<void> => {
					const commitResult = await commitStudioTableChanges({
						data: state,
						driver,
						tableName,
						tableSchema: schema,
					});

					if (commitResult.errorMessage) {
						throw new Error(commitResult.errorMessage);
					}
				},
				statements: driver.createMutationStatements(
					schema.schemaName,
					tableName,
					plans.map((plan) => plan.plan),
					schema
				),
			});
		} catch (e) {
			if (e instanceof Error) {
				alert(e.message);
			} else {
				alert(String(e));
			}
		}
	}, [driver, tableName, schema, state, openModal]);

	// @ts-expect-error TODO: Re-enable in a later PR
	const _onOrderByColumnChange = useCallback(
		(columName: string, direction: StudioSortDirection) => {
			guardUnsavedChanges(() => {
				setOrderBy({ columName, direction });
			});
		},
		[guardUnsavedChanges]
	);

	return (
		<div className="w-full h-full flex flex-col bg-surface">
			<div className="shrink-0 border-b border-border gap-2 p-2 flex items-center">
				<Button
					aria-label="Refresh"
					className="hover:bg-border! transition"
					onClick={onRefreshClicked}
					shape="square"
					variant="ghost"
				>
					<ArrowsCounterClockwiseIcon size={14} />
				</Button>

				<Button
					className="hover:bg-border! transition"
					onClick={onAddRowClick}
					variant="ghost"
				>
					<PlusIcon />
					<span className="text-xs">Add row</span>
				</Button>
				<Button
					className="hover:bg-border! transition"
					onClick={onDeleteRowClick}
					variant="ghost"
				>
					<TrashIcon />
					<span className="text-xs">Delete row</span>
				</Button>

				<div className="grow text-xs">
					{/* TODO: Re-add in a later PR */}
					{/* <StudioWhereFilterInput
						columnNameList={filterAutoCompleteColumns}
						driver={driver}
						loading={loading}
						onApply={onWhereRawApplied}
						value={whereRaw}
					/> */}
				</div>

				{changeNumber > 0 && (
					<>
						<Button
							className="text-xs"
							onClick={onDiscardClick}
							variant="outline"
						>
							<span className="text-xs">Discard</span>
						</Button>
						<Button
							className="text-xs"
							onClick={onCommit}
							variant={
								removedRowsCount === changeNumber ? "destructive" : "primary"
							}
						>
							<span>
								{removedRowsCount === changeNumber
									? `Delete ${changeNumber} row${changeNumber > 1 ? "s" : ""}`
									: `Commit ${changeNumber} change${
											changeNumber > 1 ? "s" : ""
										}`}
							</span>
						</Button>
					</>
				)}
			</div>
			<div className="grow overflow-hidden relative">
				{/* TODO: Re-add in a later PR */}
				{/* {schema && state && !error && (
					<StudioResultTable
						arrangeHeaderIndex={headerIndexList}
						onOrderByColumnChange={onOrderByColumnChange}
						orderByColumn={orderBy?.columName}
						orderByDirection={orderBy?.direction}
						state={state}
					/>
				)} */}

				{error && <div className="p-4 text-red-500 text-base">{error}</div>}

				{loading && (
					<>
						<div
							className="absolute left-0 top-0 bottom-0 right-0 backdrop-blur-md bg-black/30 dark:bg-white/30 z-40"
							style={{ opacity: 0.2 }}
						/>
						<div className="flex absolute left-0 top-0 bottom-0 right-0 justify-center items-center z-40">
							<SpinnerIcon className="animate-spin" size={48} />
						</div>
					</>
				)}
			</div>
			<div className="shrink-0 border-t border-border gap-2 p-2 flex items-center">
				<div className="grow">
					{queryStats && <StudioQueryResultStats stats={queryStats} />}
				</div>

				<div>
					<InputGroup size="base">
						<div className="flex items-center justify-center px-2 border-r border-border">
							<ListNumbersIcon size={14} />
						</div>

						<input
							aria-label="Rows per page"
							className="text-center bg-transparent text-sm outline-none border border-none rounded-r-lg px-1 w-[50px]"
							onBlur={onLimitBlur}
							onChange={(e) => setPageLimitInput(e.currentTarget.value)}
							value={pageLimitInput}
						/>
					</InputGroup>
				</div>

				<div>
					<InputGroup size="base">
						<InputGroup.Button
							aria-label="Previous page"
							disabled={!state || pageOffset <= 0}
							onClick={onPagePrevious}
							shape="square"
						>
							<CaretLeftIcon size={14} weight="bold" />
						</InputGroup.Button>

						<input
							aria-label="Page offset"
							className="text-center bg-transparent text-sm outline-none w-[50px]"
							onBlur={onOffsetBlur}
							onChange={(e) => setPageOffsetInput(e.currentTarget.value)}
							value={pageOffsetInput}
						/>

						<InputGroup.Button
							aria-label="Next page"
							disabled={!hasNextPage}
							onClick={onPageNext}
							shape="square"
							size="sm"
						>
							<CaretRightIcon size={14} weight="bold" />
						</InputGroup.Button>
					</InputGroup>
				</div>
			</div>
		</div>
	);
}
