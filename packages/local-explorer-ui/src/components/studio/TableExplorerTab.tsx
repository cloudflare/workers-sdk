import { Button, InputGroup } from "@cloudflare/kumo";
import {
	ArrowsCounterClockwiseIcon,
	CaretLeftIcon,
	CaretRightIcon,
	SpinnerIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	buildStudioMutationPlans,
	commitStudioTableChanges,
} from "../../utils/studio/commit";
import { useModal } from "../../utils/studio/stubs/modal";
import { DeleteConfirmationModal } from "../../utils/studio/stubs/ui/DeleteConfirmationModal";
import { StudioCommitConfirmation } from "./CommitConfirmation";
import { useStudioContext } from "./Context";
import StudioQueryResultStats from "./QueryResultStats";
import { StudioResultTable } from "./ResultTable";
import { createStudioTableStateFromResult } from "./Table/StateHelpers";
import { StudioWhereFilterInput } from "./WhereFilterInput";
import { useStudioCurrentWindowTab } from "./WindowTab";
import type {
	StudioResultStat,
	StudioSortDirection,
	StudioTableSchema,
} from "../../types/studio";
import type { StudioResultHeaderMetadata } from "./Table/StateHelpers";
import type { StudioTableState } from "./Table/TableState";

interface StudioTableExplorerTabProps {
	schemaName: string;
	tableName: string;
}

const DEFAULT_PAGE_SIZE = 50;

export function StudioTableExplorerTab({
	schemaName,
	tableName,
}: StudioTableExplorerTabProps) {
	const { driver, schemas } = useStudioContext();

	const [queryStats, setQueryStats] = useState<StudioResultStat>();
	const [state, setState] =
		useState<StudioTableState<StudioResultHeaderMetadata>>();

	const [error, setError] = useState("");
	const [schema, setSchema] = useState<StudioTableSchema>();
	const [loading, setLoading] = useState(true);

	const [pageOffset, setPageOffset] = useState(0);
	const [pageOffsetInput, setPageOffsetInput] = useState("0");
	const [pageLimit, setPageLimit] = useState(DEFAULT_PAGE_SIZE);
	const [pageLimitInput, setPageLimitInput] = useState(
		DEFAULT_PAGE_SIZE.toString()
	);
	const [whereRaw, setWhereRaw] = useState("");
	const [orderBy, setOrderBy] = useState<{
		columName: string;
		direction: StudioSortDirection;
	}>();

	const { openModal } = useModal();

	const [hasNextPage, setHasNextPage] = useState(false);
	const [changeNumber, setChangeNumber] = useState(0);

	const filterAutoCompleteColumns = useMemo(() => {
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
			// eslint-disable-next-line react-hooks/set-state-in-effect -- Subscribes to external store; initial sync + listener pattern is intentional
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
	useEffect(() => {
		setDirtyState(changeNumber > 0);
	}, [setDirtyState, changeNumber]);

	// Prompt the user before closing the tab if there are unsaved changes
	useEffect(() => {
		setBeforeTabClosingHandler((currentTab) => {
			if (currentTab.isDirty) {
				return confirm(
					"You have unsaved changes. Do you want to close without saving?"
				);
			}
			return true;
		});
	}, [setBeforeTabClosingHandler]);

	const onRefreshClicked = useCallback(() => {
		if (!schemas) {
			return;
		}

		setLoading(true);
		setError("");

		driver
			.selectTable(schemaName, tableName, {
				orderByColumn: orderBy?.columName,
				orderByDirection: orderBy?.direction,
				limit: pageLimit + 1, // We try to get 1 more than limit so we can decide if there is next page
				offset: pageOffset,
				whereRaw,
			})
			.then(({ result, schema: fetchedSchema }) => {
				// Fetch one extra row to check if a next page exists.
				// If more than `pageLimit` rows are returned, we know there's another page.
				// Then trim the result back down to the actual page size.
				setHasNextPage(result.rows.length > pageLimit);
				setQueryStats(result.stat);
				result.rows = result.rows.slice(0, pageLimit);

				setState(
					createStudioTableStateFromResult({
						result,
						tableSchema: fetchedSchema,
						schemas,
						rowNumberOffset: pageOffset,
						driver,
					})
				);

				setSchema(fetchedSchema);
			})
			.catch((e) => {
				setError(e.toString());
			})
			.finally(() => {
				setLoading(false);
			});
	}, [
		driver,
		schemaName,
		tableName,
		schemas,
		pageOffset,
		whereRaw,
		pageLimit,
		orderBy,
	]);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- Triggers async data fetch on mount/dependency change; setState occurs inside async .then(), not synchronously
		onRefreshClicked();
	}, [onRefreshClicked]);

	const readOnlyMode = useMemo(() => {
		if (!state) {
			return true;
		}
		return state.getHeaders().every((header) => header.setting.readonly);
	}, [state]);

	const headerIndexList = useMemo(() => {
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
		(confirmCallback: () => void, cancelCallback?: () => void) => {
			if (changeNumber > 0) {
				// The onConfirm and onClose handlers are both triggered by the modal,
				// so we use a flag isClosingAfterConfirm to distinguish whether the modal
				// was closed by confirming or by canceling.
				let isClosingAfterConfirm = false;

				openModal(DeleteConfirmationModal, {
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
					confirmationText: "Discard Changes",
					body: (
						<p>
							You have unsaved changes. Are you sure you want to discard them?
						</p>
					),
				});
			} else {
				confirmCallback();
			}
		},
		[openModal, changeNumber]
	);

	const onOffsetBlur = useCallback(
		(e: React.FocusEvent<HTMLInputElement>) => {
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
		(e: React.FocusEvent<HTMLInputElement>) => {
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

	const onPageNext = useCallback(() => {
		guardUnsavedChanges(() => {
			const clampedOffset = Math.max(pageOffset + pageLimit, 0);
			setPageOffset(clampedOffset);
			setPageOffsetInput(clampedOffset.toString());
		});
	}, [pageOffset, pageLimit, guardUnsavedChanges]);

	const onPagePrevious = useCallback(() => {
		guardUnsavedChanges(() => {
			const clampedOffset = Math.max(pageOffset - pageLimit, 0);
			setPageOffset(clampedOffset);
			setPageOffsetInput(clampedOffset.toString());
		});
	}, [pageOffset, pageLimit, guardUnsavedChanges]);

	const onWhereRawApplied = useCallback(
		(newWhereRaw: string) => {
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

	const onAddRowClick = useCallback(() => {
		if (state) {
			state.insertNewRow();
		}
	}, [state]);

	const onDeleteRowClick = useCallback(() => {
		if (state) {
			state.getSelectedRowIndex().map((rowIndex) => state.removeRow(rowIndex));
		}
	}, [state]);

	const onDiscardClick = useCallback(() => {
		if (state) {
			state.discardAllChange();
		}
	}, [state]);

	const onCommit = useCallback(() => {
		if (!schema || !state) {
			return;
		}

		try {
			const plans = buildStudioMutationPlans({
				tableSchema: schema,
				data: state,
			});

			openModal(StudioCommitConfirmation, {
				onClose: () => {},
				statements: driver.createMutationStatements(
					schema.schemaName,
					tableName,
					plans.map((plan) => plan.plan),
					schema
				),
				onConfirm: async (): Promise<void> => {
					const commitResult = await commitStudioTableChanges({
						driver,
						tableName,
						tableSchema: schema,
						data: state,
					});

					if (commitResult.errorMessage) {
						throw new Error(commitResult.errorMessage);
					}
				},
			});
		} catch (e) {
			if (e instanceof Error) {
				alert(e.message);
			} else {
				alert(String(e));
			}
		}
	}, [driver, tableName, schema, state, openModal]);

	const onOrderByColumnChange = useCallback(
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
				<Button shape="square" onClick={onRefreshClicked}>
					<ArrowsCounterClockwiseIcon size={14} />
				</Button>

				{!readOnlyMode && (
					<>
						<Button onClick={onAddRowClick}>
							<span className="text-xs">Add row</span>
						</Button>
						<Button onClick={onDeleteRowClick}>
							<span className="text-xs">Delete row</span>
						</Button>
					</>
				)}

				<div className="grow text-xs">
					<StudioWhereFilterInput
						driver={driver}
						value={whereRaw}
						columnNameList={filterAutoCompleteColumns}
						onApply={onWhereRawApplied}
						loading={loading}
					/>
				</div>

				{changeNumber > 0 && (
					<>
						<Button
							variant="outline"
							className="text-xs"
							onClick={onDiscardClick}
						>
							<span className="text-xs">Discard</span>
						</Button>
						<Button
							className="text-xs"
							variant={
								removedRowsCount === changeNumber ? "destructive" : "primary"
							}
							onClick={onCommit}
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
				{schema && state && !error && (
					<StudioResultTable
						state={state}
						arrangeHeaderIndex={headerIndexList}
						orderByColumn={orderBy?.columName}
						orderByDirection={orderBy?.direction}
						onOrderByColumnChange={onOrderByColumnChange}
					/>
				)}

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
			<div className="shrink-0 border-t border-border gap-2 py-1 px-2 flex items-center">
				<div className="grow">
					{queryStats && <StudioQueryResultStats stats={queryStats} />}
				</div>

				<div>
					<InputGroup size="base">
						<InputGroup.Button
							shape="square"
							disabled={!state || pageOffset <= 0}
							onClick={onPagePrevious}
						>
							<CaretLeftIcon size={14} weight="bold" />
						</InputGroup.Button>
						<input
							className="border-l text-center bg-transparent text-sm outline-none"
							style={{ width: 50 }}
							value={pageLimitInput}
							onChange={(e) => setPageLimitInput(e.currentTarget.value)}
							aria-label="Limit"
							onBlur={onLimitBlur}
						/>
						<input
							style={{ width: 50 }}
							value={pageOffsetInput}
							className="border-l text-center bg-transparent text-sm outline-none"
							onChange={(e) => setPageOffsetInput(e.currentTarget.value)}
							aria-label="Offset"
							onBlur={onOffsetBlur}
						/>
						<InputGroup.Button
							size="sm"
							shape="square"
							onClick={onPageNext}
							disabled={!hasNextPage}
						>
							<CaretRightIcon size={14} weight="bold" />
						</InputGroup.Button>
					</InputGroup>
				</div>
			</div>
		</div>
	);
}
