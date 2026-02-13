import { Button, DropdownMenu } from "@cloudflare/kumo";
import { SplitPane } from "@cloudflare/workers-editor-shared";
import { BinocularsIcon, CaretDownIcon, PlayIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runStudioMultipleSQLStatements } from "../../utils/studio";
import { beautifySQLQuery } from "../../utils/studio/formatter";
import { useStudioContext } from "./Context";
import { StudioQueryResultSummary } from "./QueryResultSummary";
import { StudioQueryResultTab } from "./QueryResultTab";
import { StudioSQLEditor } from "./SQLEditor";
import {
	resolveStudioToNearestStatement,
	splitStudioSQLStatements,
} from "./SQLEditor/StatementHighlightExtension";
import { StudioWindowTab } from "./WindowTab";
import type {
	StudioMultipleQueryProgress,
	StudioMultipleQueryResult,
} from "../../types/studio";
import type { StudioCodeMirrorReference } from "./CodeMirror";
import type { StudioWindowTabItem } from "./WindowTab";

interface StudioQueryTabProps {
	query?: string;
}

export function StudioQueryTab({ query }: StudioQueryTabProps): JSX.Element {
	const editorRef = useRef<StudioCodeMirrorReference>(null);
	const { driver, schemas, refreshSchema } = useStudioContext();

	const [selectedResultTabKey, setSelectedResultTabKey] =
		useState<string>("summary");
	const [results, setResults] = useState<StudioMultipleQueryResult[]>();
	const [progress, setProgress] = useState<StudioMultipleQueryProgress>();
	const [loading, setLoading] = useState(false);

	// Cursor Information
	const [lineNumber, setLineNumber] = useState(1);
	const [columnNumber, setColumnNumber] = useState(1);

	const runMultipleStatements = useCallback(
		(statements: string[]): void => {
			setResults(undefined);
			setProgress(undefined);
			setLoading(true);

			runStudioMultipleSQLStatements(driver, statements, setProgress)
				.then((r) => {
					setResults(r.result);

					const hasAlterSchema = r.logs.some((log) => {
						const sql = log.sql.trim().toLowerCase();
						return sql.startsWith("create ") || sql.startsWith("drop ");
					});

					if (hasAlterSchema) {
						refreshSchema();
					}
				})
				.catch(console.error)
				.finally(() => setLoading(false));
		},
		[driver, setProgress, refreshSchema]
	);

	const onRunAllClicked = useCallback((): void => {
		const view = editorRef.current?.view;
		if (!view) {
			return;
		}

		const statements = splitStudioSQLStatements(view.state, true);
		runMultipleStatements(statements.map((statement) => statement.text));
	}, [editorRef, runMultipleStatements]);

	const onRunCurrentClicked = useCallback((): void => {
		const view = editorRef.current?.view;
		if (!view) {
			return;
		}

		const segment = resolveStudioToNearestStatement(view.state);
		if (!segment) {
			return;
		}

		const statement = view.state.doc.sliceString(segment.from, segment.to);
		runMultipleStatements([statement]);
	}, [editorRef, runMultipleStatements]);

	const keybinding = useMemo(
		() => [
			{
				key: "Ctrl-Enter",
				mac: "Cmd-Enter",
				preventDefault: true,
				run: () => {
					onRunCurrentClicked();
					return true;
				},
			},
			{
				key: "Shift-Ctrl-Enter",
				mac: "Shift-Cmd-Enter",
				preventDefault: true,
				run: () => {
					onRunAllClicked();
					return true;
				},
			},
		],
		[onRunAllClicked, onRunCurrentClicked]
	);

	// Update cursor position information
	const onCursorChange = useCallback(
		(_: unknown, line: number, col: number): void => {
			setLineNumber(line);
			setColumnNumber(col + 1);
		},
		[]
	);

	// Showing the result as tab
	const queryTabs = useMemo(() => {
		if (!progress) {
			return null;
		}

		const queryTabItems: StudioWindowTabItem[] = [];

		for (const result of results ?? []) {
			const customTab = driver.getQueryTabOverride(result.sql, result.result);

			if (customTab) {
				queryTabItems.push({
					key: `query-${result.order}`,
					identifier: `query-${result.order}`,
					component: customTab.component,
					icon: customTab.icon,
					title: customTab.label,
				});
			} else if (result.result.rows) {
				const queryTabSizeSuffix = ` • ${result.result.headers.length}\u2006x\u2006${result.result.rows.length}`;

				queryTabItems.push({
					key: `query-${result.order}`,
					identifier: `query-${result.order}`,
					component: <StudioQueryResultTab result={result} />,
					icon: BinocularsIcon,
					title: (result.predictedTableName || "Query") + queryTabSizeSuffix,
				});
			}
		}

		queryTabItems.push({
			key: "summary",
			identifier: "summary",
			component: <StudioQueryResultSummary progress={progress} />,
			icon: BinocularsIcon,
			title: "Summary",
		});

		return queryTabItems;
	}, [progress, results, driver]);

	// Select the first result tab when query tabs change
	useEffect(() => {
		if (queryTabs && queryTabs.length > 0) {
			// Synchronizes tab selection after query results change; length check guarantees this exists
			const [tab] = queryTabs as [StudioWindowTabItem];
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setSelectedResultTabKey(tab.key);
		}
	}, [queryTabs]);

	const autoCompelteSchema = useMemo(() => {
		if (!schemas) {
			return {};
		}

		const currentSchema = schemas["main"];
		if (!currentSchema) {
			return {};
		}

		return Object.fromEntries(
			currentSchema
				.map((tableSchema) => {
					if (!tableSchema.tableSchema) {
						return [tableSchema.name, []];
					}

					return [
						tableSchema.name,
						tableSchema.tableSchema.columns.map((column) => column.name),
					] satisfies [string, string[]];
				})
				.filter(([_, columns]) => columns.length > 0)
		) as Record<string, string[]>;
	}, [schemas]);

	const handleFormat = useCallback((): void => {
		try {
			if (!editorRef.current) {
				return;
			}
			editorRef.current.setValue(
				beautifySQLQuery(editorRef.current.getValue(), driver.dialect)
			);
		} catch (e) {
			console.error(e);
		}
	}, [editorRef, driver]);

	const handleExplain = useCallback((): void => {
		const currentEditor = editorRef.current;
		if (!currentEditor) {
			return;
		}

		const explainStatement = driver.buildExplainStatement(
			currentEditor.getValue()
		);

		runMultipleStatements([explainStatement]);
	}, [editorRef, driver, runMultipleStatements]);

	return (
		<SplitPane
			defaultSize={250}
			minSize={150}
			resizerClassName="!bg-resizer border-transparent"
			split="horizontal"
		>
			<div className="w-full flex flex-col bg-surface">
				<div className="grow overflow-hidden">
					<StudioSQLEditor
						autoCompleteSchema={autoCompelteSchema}
						autoFocus
						className="p-2 w-full h-full"
						defaultValue={query}
						dialect={driver.dialect}
						keybinding={keybinding}
						onCursorChange={onCursorChange}
						ref={editorRef}
						statementHighlight
					/>
				</div>
				<div
					className="shrink-0 py-2 px-4 flex items-center gap-2"
					style={{ paddingTop: 0 }}
				>
					<div className="text-xs grow text-muted">
						Ln {lineNumber} Col {columnNumber}
					</div>

					<Button
						className="h-8 text-xs"
						onClick={handleFormat}
						variant="ghost"
					>
						Format ⇧⌘F
					</Button>

					<div className="flex overflow-hidden">
						<Button
							className="h-8 text-xs rounded-r-none pr-2!"
							icon={<PlayIcon weight="fill" />}
							loading={loading}
							onClick={onRunCurrentClicked}
							variant="primary"
						>
							Run
						</Button>

						<DropdownMenu>
							<DropdownMenu.Trigger
								render={
									<Button
										className="h-8 text-xs px-2 rounded-r-md rounded-l-none ml-0"
										disabled={loading}
										variant="primary"
									>
										<CaretDownIcon weight="bold" />
									</Button>
								}
							/>
							<DropdownMenu.Content
								align="end"
								side="bottom"
								style={{ width: 250 }}
							>
								<DropdownMenu.Item onSelect={onRunCurrentClicked}>
									Run current statement
									<DropdownMenu.Shortcut>⌘+⏎</DropdownMenu.Shortcut>
								</DropdownMenu.Item>
								<DropdownMenu.Item onSelect={onRunAllClicked}>
									Run all statement
									<DropdownMenu.Shortcut>⇧+⌘+⏎</DropdownMenu.Shortcut>
								</DropdownMenu.Item>

								{driver.isSupportExplain && (
									<>
										<DropdownMenu.Separator />
										<DropdownMenu.Item onSelect={handleExplain}>
											Explain current statement
										</DropdownMenu.Item>
									</>
								)}
							</DropdownMenu.Content>
						</DropdownMenu>
					</div>
				</div>
			</div>
			<div className="w-full h-full bg-surface">
				{queryTabs && queryTabs.length > 0 && (
					<StudioWindowTab
						key="main-window-tab"
						onSelectedTabChange={setSelectedResultTabKey}
						selectedTabKey={selectedResultTabKey}
						tabs={queryTabs}
					/>
				)}
			</div>
		</SplitPane>
	);
}
