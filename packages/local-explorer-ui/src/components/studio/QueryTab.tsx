import { Button, DropdownMenu } from "@cloudflare/kumo";
import { SplitPane } from "@cloudflare/workers-editor-shared";
import { BinocularsIcon, CaretDownIcon, PlayIcon } from "@phosphor-icons/react";
import { useCallback, useMemo, useRef, useState } from "react";
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
} from "../../utils/studio";
import type { StudioCodeMirrorReference } from "./CodeMirror";
import type { StudioWindowTabItem } from "./WindowTab";

export function StudioQueryTab({
	query,
}: {
	query?: string;
	savedQueryId?: string;
}) {
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
		(statements: string[]) => {
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

	const onRunAllClicked = useCallback(() => {
		const view = editorRef.current?.view;
		if (!view) {
			return;
		}

		const statements = splitStudioSQLStatements(view.state, true);
		runMultipleStatements(statements.map((statement) => statement.text));
	}, [editorRef, runMultipleStatements]);

	const onRunCurrentClicked = useCallback(() => {
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

	const keybinding = useMemo(() => {
		return [
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
		];
	}, [onRunAllClicked, onRunCurrentClicked]);

	// Update cursor position information
	const onCursorChange = useCallback(
		(_: unknown, line: number, col: number) => {
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

		const queryTabs: StudioWindowTabItem[] = [];

		for (const result of results ?? []) {
			const customTab = driver.getQueryTabOverride(result.sql, result.result);

			if (customTab) {
				queryTabs.push({
					key: `query-${result.order}`,
					identifier: `query-${result.order}`,
					component: customTab.component,
					icon: customTab.icon,
					title: customTab.label,
				});
			} else if (result.result.rows) {
				const queryTabSizeSuffix = ` • ${result.result.headers.length}\u2006x\u2006${result.result.rows.length}`;

				queryTabs.push({
					key: `query-${result.order}`,
					identifier: `query-${result.order}`,
					component: <StudioQueryResultTab result={result} />,
					icon: BinocularsIcon,
					title: (result.predictedTableName || "Query") + queryTabSizeSuffix,
				});
			}
		}

		queryTabs.push({
			key: "summary",
			identifier: "summary",
			component: <StudioQueryResultSummary progress={progress} />,
			icon: BinocularsIcon,
			title: "Summary",
		});

		if (queryTabs.length > 0) {
			setSelectedResultTabKey(queryTabs[0].key);
		}

		return queryTabs;
	}, [progress, results, setSelectedResultTabKey, driver]);

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
					];
				})
				.filter(([_, columns]) => columns.length > 0)
		);
	}, [schemas]);

	const handleFormat = useCallback(() => {
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

	const handleExplain = useCallback(() => {
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
			split="horizontal"
			minSize={150}
			defaultSize={250}
			resizerClassName="!bg-neutral-300 dark:!bg-neutral-800 border-transparent"
		>
			<div className="w-full flex flex-col bg-white dark:bg-black">
				<div className="grow overflow-hidden">
					<StudioSQLEditor
						ref={editorRef}
						autoFocus
						dialect={driver.dialect}
						onCursorChange={onCursorChange}
						statementHighlight
						autoCompleteSchema={autoCompelteSchema}
						className="p-2 w-full h-full"
						defaultValue={query}
						keybinding={keybinding}
					/>
				</div>
				<div
					className="shrink-0 py-2 px-4 flex items-center gap-2"
					style={{ paddingTop: 0 }}
				>
					<div className="text-xs grow text-neutral-500">
						Ln {lineNumber} Col {columnNumber}
					</div>

					<Button
						variant="ghost"
						className="h-8 text-xs"
						onClick={handleFormat}
					>
						Format ⌥ F
					</Button>

					<div className="flex overflow-hidden">
						<Button
							className="h-8 text-xs rounded-r-none !pr-2"
							variant="primary"
							icon={<PlayIcon weight="fill" />}
							loading={loading}
							onClick={onRunCurrentClicked}
						>
							Run
						</Button>

						<DropdownMenu>
							<DropdownMenu.Trigger asChild>
								<Button
									disabled={loading}
									variant="primary"
									className="h-8 text-xs px-2 rounded-r-md rounded-l-none ml-0"
								>
									<CaretDownIcon weight="bold" />
								</Button>
							</DropdownMenu.Trigger>
							<DropdownMenu.Content
								side="bottom"
								align="end"
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
			<div className="w-full h-full bg-white dark:bg-black">
				{queryTabs && queryTabs.length > 0 && (
					<StudioWindowTab
						key="main-window-tab"
						tabs={queryTabs}
						onSelectedTabChange={setSelectedResultTabKey}
						selectedTabKey={selectedResultTabKey}
					/>
				)}
			</div>
		</SplitPane>
	);
}
