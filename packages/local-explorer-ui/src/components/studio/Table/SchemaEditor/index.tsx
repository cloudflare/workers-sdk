import { Button } from "@cloudflare/kumo";
import { SplitPane } from "@cloudflare/workers-editor-shared";
import { KeyIcon } from "@phosphor-icons/react";
import { produce } from "immer";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { isEqual } from "../../../../utils/is-equal";
import { useModal } from "../../Modal";
import { StudioCommitConfirmation } from "../../Modal/CommitConfirmation";
import { StudioSQLEditor } from "../../SQLEditor";
import { StudioColumnEditorModal, StudioColumnSchemaEditor } from "./Column";
import { StudioConstraintListEditor } from "./ConstraintListEditor";
import type {
	IStudioDriver,
	StudioTableColumn,
	StudioTableIndex,
	StudioTableSchemaChange,
} from "../../../../types/studio";
import type { StudioCodeMirrorReference } from "../../Code/Mirror";
import type { Dispatch, SetStateAction } from "react";

interface StudioTableSchemaEditorProps {
	disabledAddColumn?: boolean;
	driver: IStudioDriver;
	highlightSchemaChanges?: boolean;
	onChange: Dispatch<SetStateAction<StudioTableSchemaChange>>;
	onSaveChange: (statements: string[]) => Promise<void>;
	readOnlyExistingColumns?: boolean;
	value: StudioTableSchemaChange;
}

export function StudioTableSchemaEditor({
	disabledAddColumn,
	driver,
	highlightSchemaChanges,
	onChange,
	onSaveChange,
	readOnlyExistingColumns,
	value,
}: StudioTableSchemaEditorProps): JSX.Element {
	const { openModal } = useModal();

	const editorRef = useRef<StudioCodeMirrorReference>(null);

	const handleNameChange = useCallback(
		(newName: string): void => {
			onChange((prev) =>
				produce(prev, (draft) => {
					draft.name.new = newName;
				})
			);
		},
		[onChange]
	);

	const isSchemaDirty = useMemo(
		(): boolean =>
			value.name.new !== value.name.old ||
			value.columns.some((change) => !isEqual(change.new, change.old)) ||
			value.constraints.some((change) => !isEqual(change.new, change.old)),
		[value]
	);

	const isSaveEnabled = useMemo(
		// Enable save only if there's at least one column, a table name, and some change detected
		(): boolean =>
			isSchemaDirty && !!value.name.new && value.columns.length > 0,
		[isSchemaDirty, value]
	);

	const handleAddColumn = useCallback((): void => {
		openModal(StudioColumnEditorModal, {
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
			schemaChanges: value,
		});
	}, [onChange, value, openModal]);

	useEffect((): void => {
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

	const handleSaveChange = useCallback((): void => {
		try {
			const previewStatements = driver.generateTableSchemaStatement(value);
			openModal(StudioCommitConfirmation, {
				onConfirm: async () => {
					await onSaveChange(previewStatements);
				},
				statements: previewStatements,
			});
		} catch {
			console.log("Cannot generate statements");
		}
	}, [driver, value, openModal, onSaveChange]);

	const handleDiscard = useCallback((): void => {
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
			defaultSize={250}
			minSize={150}
			primary="second"
			resizerClassName="!bg-resizer border-transparent"
			split="horizontal"
		>
			<div className="flex flex-col w-full h-full overflow-hidden text-xs bg-surface">
				<div className="flex gap-2 p-4 py-2 border-b border-border shadow-xs">
					<input
						autoFocus
						className="w-62.5 h-9 rounded-lg border border-border px-3 text-base bg-transparent"
						onChange={(e) => handleNameChange(e.target.value)}
						placeholder="Table name"
						value={value.name.new ?? ""}
					/>
					<div className="grow" />
					<div className="flex gap-2">
						{isSchemaDirty && (
							<Button variant="destructive" onClick={handleDiscard}>
								Discard
							</Button>
						)}
						<Button
							disabled={!isSaveEnabled}
							onClick={handleSaveChange}
							variant={isSaveEnabled ? "primary" : "secondary"}
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
									<th className="w-10 p-2 border border-border text-center">
										#
									</th>
									<th className="w-10 p-2 border border-border text-center">
										<KeyIcon />
									</th>
									<th className="w-50 p-2 border border-border text-left">
										Column Name
									</th>
									<th className="w-25 p-2 border border-border text-left">
										Type
									</th>
									<th className="w-12.5 p-2 border border-border text-left">
										NULL
									</th>
									<th className="w-31.25 p-2 border border-border text-left">
										Default Value
									</th>
									<th className="p-2 border border-border"></th>
									<th className="w-10 p-2 border border-border"></th>
								</tr>
							</thead>
							<tbody>
								{value.columns.map((_, columnIndex) => (
									<StudioColumnSchemaEditor
										columnIndex={columnIndex}
										highlightSchemaChanges={highlightSchemaChanges}
										key={columnIndex}
										onChange={onChange}
										readOnlyExistingColumns={readOnlyExistingColumns}
										value={value}
									/>
								))}
							</tbody>
						</table>

						{!disabledAddColumn && (
							<Button className="my-2" onClick={handleAddColumn}>
								Add Column
							</Button>
						)}

						<StudioConstraintListEditor onChange={onChange} value={value} />
						<IndexList indexList={value.indexes ?? []} />
					</div>
				</div>
			</div>
			<div className="overflow-hidden grow bg-surface">
				<StudioSQLEditor
					className="h-full w-full grow"
					readOnly
					ref={editorRef}
				/>
			</div>
		</SplitPane>
	);
}

interface IndexListProps {
	indexList: StudioTableIndex[];
}

function IndexList({ indexList }: IndexListProps): JSX.Element | null {
	if (indexList.length === 0) {
		return null;
	}

	return (
		<>
			<div className="text-base font-bold my-4">Indexes</div>

			<table className="border-collapse w-full">
				<thead>
					<tr>
						<th className="w-10 p-2 border border-border">#</th>
						<th className="w-50 p-2 border border-border text-left">
							Index Name
						</th>
						<th className="w-25 p-2 border border-border text-left">Type</th>
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
