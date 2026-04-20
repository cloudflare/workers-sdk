import { Button, cn, DropdownMenu, Table } from "@cloudflare/kumo";
import { DotsThreeIcon, PencilIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { validateKey } from "../utils/kv-validation";
import { CopyButton } from "./CopyButton";
import type { KVEntry } from "../api";

interface KVTableProps {
	entries: KVEntry[];
	onSave: (
		originalKey: string,
		newKey: string,
		value: string
	) => Promise<boolean>;
	onDelete: (keyName: string) => void;
}

function formatValue(value: string | null, maxLength = 100): string {
	if (value === "") {
		return "(empty)";
	}
	if (value === null) {
		return JSON.stringify(value);
	}
	if (value.length > maxLength) {
		return value.slice(0, maxLength) + "...";
	}
	return value;
}

interface ActionMenuProps {
	onEdit: () => void;
	onDelete: () => void;
}

function ActionMenu({ onEdit, onDelete }: ActionMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				render={
					<Button
						variant="ghost"
						shape="square"
						className="h-7! w-7!"
						aria-label="Actions"
					>
						<DotsThreeIcon size={16} weight="bold" />
					</Button>
				}
			/>
			<DropdownMenu.Content align="end" sideOffset={4}>
				<DropdownMenu.Item className="flex items-center gap-2" onClick={onEdit}>
					<PencilIcon />
					<span>Edit</span>
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item
					className="flex items-center gap-2 text-kumo-danger"
					onClick={onDelete}
				>
					<TrashIcon />
					<span>Delete</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

interface EditingState {
	originalKey: string;
	key: string;
	value: string;
	keyError: string | null;
}

export function KVTable({ entries, onSave, onDelete }: KVTableProps) {
	const [editData, setEditData] = useState<EditingState | null>(null);
	const [saving, setSaving] = useState(false);

	const handleStartEdit = (entry: KVEntry) => {
		setEditData({
			originalKey: entry.key.name,
			key: entry.key.name,
			value: entry.value ?? "",
			keyError: null,
		});
	};

	const handleKeyChange = (newKey: string) => {
		if (!editData) {
			return;
		}
		setEditData({
			...editData,
			key: newKey,
			keyError: newKey.trim() ? validateKey(newKey) : null,
		});
	};

	const handleSave = async () => {
		if (!editData) {
			return;
		}
		const validationError = validateKey(editData.key);
		if (validationError) {
			setEditData({ ...editData, keyError: validationError });
			return;
		}

		try {
			setSaving(true);
			// onSave will set errors on the parent if something fails
			// see `error` in $namespaceId.tsx
			const completed = await onSave(
				editData.originalKey,
				editData.key,
				editData.value
			);
			if (completed) {
				setEditData(null);
			}
		} finally {
			setSaving(false);
		}
	};

	const handleCancel = () => {
		setEditData(null);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			handleCancel();
		} else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			void handleSave();
		}
	};

	const isKeyInvalid = editData ? !!validateKey(editData.key) : false;

	return (
		<div className="overflow-hidden rounded-lg border border-kumo-fill">
			<Table>
				<Table.Header>
					<Table.Row>
						<Table.Head>Key</Table.Head>
						<Table.Head>Value</Table.Head>
						<Table.Head className="w-12" />
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{entries.map((entry) => {
						const isEditing = editData?.originalKey === entry.key.name;
						return (
							<Table.Row key={entry.key.name} className="group">
								<Table.Cell className="group/cell align-top">
									{isEditing && editData ? (
										<div className="flex flex-col">
											<label
												className="sr-only"
												htmlFor={`edit-key-${entry.key.name}`}
											>
												Key
											</label>
											<input
												id={`edit-key-${entry.key.name}`}
												className={cn(
													"focus-visible:ring-kumo-ring min-h-8 w-full rounded border border-kumo-brand bg-kumo-base px-2 py-1.5 font-mono text-[13px] text-kumo-default focus:outline-none focus-visible:ring-2 disabled:bg-kumo-elevated disabled:text-kumo-subtle",
													{
														"border-kumo-danger focus-visible:ring-2 focus-visible:ring-kumo-danger":
															editData.keyError,
													}
												)}
												value={editData.key}
												onChange={(e) => handleKeyChange(e.target.value)}
												onKeyDown={handleKeyDown}
												disabled={saving}
												autoFocus
											/>
											{editData.keyError && (
												<span className="mt-1 text-xs text-kumo-danger">
													{editData.keyError}
												</span>
											)}
										</div>
									) : (
										<div className="group/cell flex items-center gap-1.5">
											<code className="font-medium text-kumo-link">
												{entry.key.name}
											</code>
											<CopyButton text={entry.key.name} />
										</div>
									)}
								</Table.Cell>
								<Table.Cell className="group/cell max-w-100 font-mono text-[13px]">
									{isEditing && editData ? (
										<div className="flex flex-col gap-2">
											<label
												className="sr-only"
												htmlFor={`edit-value-${entry.key.name}`}
											>
												Value
											</label>
											<textarea
												id={`edit-value-${entry.key.name}`}
												className="focus-visible:ring-kumo-ring field-sizing-content max-h-50 min-h-8 w-full resize-none overflow-y-auto rounded border border-kumo-brand bg-kumo-base px-2 py-1.5 font-mono text-[13px] text-kumo-default focus:outline-none focus-visible:ring-2 disabled:bg-kumo-elevated disabled:text-kumo-subtle"
												value={editData.value}
												onChange={(e) =>
													setEditData({ ...editData, value: e.target.value })
												}
												onKeyDown={handleKeyDown}
												disabled={saving}
											/>
											<div className="flex justify-end gap-1.5">
												<Button
													variant="secondary"
													size="sm"
													onClick={handleCancel}
													disabled={saving}
												>
													Cancel
												</Button>
												<Button
													variant="primary"
													size="sm"
													onClick={handleSave}
													disabled={saving || isKeyInvalid}
													loading={saving}
												>
													{saving ? "Saving..." : "Save"}
												</Button>
											</div>
										</div>
									) : (
										<div className="flex min-w-0 items-center gap-1.5">
											<span
												className={cn("min-w-0 truncate", {
													"text-kumo-subtle": !entry.value,
												})}
											>
												{formatValue(entry.value)}
											</span>
											{entry.value && <CopyButton text={entry.value} />}
										</div>
									)}
								</Table.Cell>
								<Table.Cell className="text-right whitespace-nowrap">
									{!isEditing && (
										<ActionMenu
											onEdit={() => handleStartEdit(entry)}
											onDelete={() => void onDelete(entry.key.name)}
										/>
									)}
								</Table.Cell>
							</Table.Row>
						);
					})}
				</Table.Body>
			</Table>
		</div>
	);
}
