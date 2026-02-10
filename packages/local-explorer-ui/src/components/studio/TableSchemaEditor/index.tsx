import { Button, Input } from "@cloudflare/kumo";
import { SplitPane } from "@cloudflare/workers-editor-shared";
import { KeyIcon } from "@phosphor-icons/react";
import { produce } from "immer";
import { isEqual } from "lodash";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useModal } from "../../../utils/studio/stubs/modal";
import { StudioCommitConfirmation } from "../CommitConfirmation";
import { StudioSQLEditor } from "../SQLEditor";
import {
	StudioColumnEditiorDrawer,
	StudioColumnSchemaEditor,
} from "./ColumnSchemaEditor";
import { StudioConstraintListEditor } from "./ConstraintListEditor";
import type {
	IStudioDriver,
	StudioTableColumn,
	StudioTableIndex,
	StudioTableSchemaChange,
} from "../../../types/studio";
import type { StudioCodeMirrorReference } from "../CodeMirror";

interface StudioTableSchemaEditorProps {
	value: StudioTableSchemaChange;
	driver: IStudioDriver;
	onChange: React.Dispatch<React.SetStateAction<StudioTableSchemaChange>>;
	highlightSchemaChanges?: boolean;
	readOnlyExistingColumns?: boolean;
	disabledAddColumn?: boolean;
	onSaveChange: (statements: string[]) => Promise<void>;
}

export function StudioTableSchemaEditor({
	value,
	onChange,
	driver,
	highlightSchemaChanges,
	readOnlyExistingColumns,
	onSaveChange,
	disabledAddColumn,
}: StudioTableSchemaEditorProps) {
	const { openModal } = useModal();

	const editorRef = useRef<StudioCodeMirrorReference>(null);

	const handleNameChange = useCallback(
		(newName: string) => {
			onChange((prev) =>
				produce(prev, (draft) => {
					draft.name.new = newName;
				})
			);
		},
		[onChange]
	);

	const isSchemaDirty = useMemo(() => {
		return (
			value.name.new !== value.name.old ||
			value.columns.some((change) => !isEqual(change.new, change.old)) ||
			value.constraints.some((change) => !isEqual(change.new, change.old))
		);
	}, [value]);

	const isSaveEnabled = useMemo(() => {
		// Enable save only if there's at least one column, a table name, and some change detected
		return isSchemaDirty && value.name.new && value.columns.length > 0;
	}, [isSchemaDirty, value]);

	const handleAddColumn = useCallback(() => {
		openModal(StudioColumnEditiorDrawer, {
			schemaChanges: value,
			onConfirm: (newColumn: StudioTableColumn) => {
				onChange((prev) =>
					produce(prev, (draft) => {
						draft.columns.push({
							key: window.crypto.randomUUID(),
							old: null,
							new: newColumn,
						});
					})
				);
			},
		});
	}, [onChange, value, openModal]);

	useEffect(() => {
		if (!editorRef.current) {
			return;
		}

		try {
			editorRef.current.setValue(
				driver.generateTableSchemaStatement(value).join("\n")
			);
		} catch (e) {
			console.log("Some error", e);
		}
	}, [driver, value, editorRef]);

	const handleSaveChange = useCallback(() => {
		try {
			const previewStatements = driver.generateTableSchemaStatement(value);
			openModal(StudioCommitConfirmation, {
				statements: previewStatements,
				onConfirm: async () => {
					await onSaveChange(previewStatements);
				},
			});
		} catch {
			console.log("Cannot generate statements");
		}
	}, [driver, value, openModal, onSaveChange]);

	const handleDiscard = useCallback(() => {
		onChange((prev) =>
			produce(prev, (draft) => {
				draft.name.new = draft.name.old;
				draft.columns = draft.columns
					.filter((draftColumn) => draftColumn.old)
					.map((draftColumn) => ({
						...draftColumn,
						new: draftColumn.old,
					}));

				draft.constraints = draft.constraints
					.filter((draftConstraint) => draftConstraint.old)
					.map((draftConstraint) => ({
						...draftConstraint,
						new: draftConstraint.old,
					}));
			})
		);
	}, [onChange]);

	return (
		<SplitPane
			split="horizontal"
			minSize={150}
			defaultSize={250}
			primary="second"
		>
			<div className="flex flex-col w-full h-full overflow-hidden text-xs bg-surface">
				<div className="flex gap-2 p-4 py-2 border-b border-color shadow-xs">
					<Input
						autoFocus
						style={{ width: "250px" }}
						placeholder="Table name"
						size="base"
						value={value.name.new ?? ""}
						onValueChange={handleNameChange}
						disabled={readOnlyExistingColumns}
					/>
					<div className="grow" />
					<div className="flex gap-2">
						{isSchemaDirty && (
							<Button variant="destructive" onClick={handleDiscard}>
								Discard
							</Button>
						)}
						<Button
							onClick={handleSaveChange}
							variant={isSaveEnabled ? "primary" : "secondary"}
							disabled={!isSaveEnabled}
						>
							Save Change
						</Button>
					</div>
				</div>

				<div className="overflow-auto grow relative">
					<div className="p-4">
						<table className="border-collapse w-full">
							<thead className="sticky top-0">
								<tr>
									<th
										className="p-2 border border-border text-center"
										style={{ width: 40 }}
									>
										#
									</th>
									<th
										className="p-2 border border-border text-center"
										style={{ width: 40 }}
									>
										<KeyIcon />
									</th>
									<th
										className="p-2 border border-border text-left"
										style={{ width: "200px" }}
									>
										Column Name
									</th>
									<th
										className="p-2 border border-border text-left"
										style={{ width: "100px" }}
									>
										Type
									</th>
									<th
										className="p-2 border border-border text-left"
										style={{ width: "50px" }}
									>
										NULL
									</th>
									<th
										className="p-2 border border-border text-left"
										style={{ width: "125px" }}
									>
										Default Value
									</th>
									<th className="p-2 border border-border"></th>
									<th
										className="p-2 border border-border"
										style={{ width: 40 }}
									></th>
								</tr>
							</thead>
							<tbody>
								{value.columns.map((_, columnIndex) => {
									return (
										<StudioColumnSchemaEditor
											columnIndex={columnIndex}
											highlightSchemaChanges={highlightSchemaChanges}
											key={columnIndex}
											onChange={onChange}
											readOnlyExistingColumns={readOnlyExistingColumns}
											value={value}
										/>
									);
								})}
							</tbody>
						</table>

						{!disabledAddColumn && (
							<Button onClick={handleAddColumn} className="my-2">
								Add Column
							</Button>
						)}

						<StudioConstraintListEditor value={value} onChange={onChange} />
						<IndexList indexList={value.indexes ?? []} />
					</div>
				</div>
			</div>
			<div className="overflow-hidden grow bg-surface">
				<StudioSQLEditor
					ref={editorRef}
					readOnly
					className="h-full w-full grow"
				/>
			</div>
		</SplitPane>
	);
}

function IndexList({ indexList }: { indexList: StudioTableIndex[] }) {
	if (indexList.length === 0) {
		return null;
	}

	return (
		<>
			<div className="text-base font-bold my-4">Indexes</div>
			<table className="border-collapse w-full">
				<thead>
					<tr>
						<th className="p-2 border border-border" style={{ width: 40 }}>
							#
						</th>
						<th
							className="p-2 border border-border text-left"
							style={{ width: 200 }}
						>
							Index Name
						</th>
						<th
							className="p-2 border border-border text-left"
							style={{ width: 100 }}
						>
							Type
						</th>
						<th className="p-2 border border-border text-left"></th>
					</tr>
				</thead>
				<tbody>
					{indexList.map((index, indexIdx) => {
						return (
							<tr key={index.name}>
								<td className="p-2 border border-border">{indexIdx + 1}</td>
								<td className="p-2 border border-border">{index.name}</td>
								<td className="p-2 border border-border">{index.type}</td>
								<td className="p-2 border border-border font-mono">
									{index.columns.join(", ")}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</>
	);
}
