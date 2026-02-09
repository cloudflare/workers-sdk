import { Button } from "@base-ui/react/button";
import { Menu } from "@base-ui/react/menu";
import { cn } from "@cloudflare/kumo";
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
		<Menu.Root>
			<Menu.Trigger
				className="flex items-center justify-center w-7 h-7 border-none rounded-md bg-transparent text-text-secondary cursor-pointer transition-[background-color,color] hover:bg-border hover:text-text"
				aria-label="Actions"
			>
				<DotsThreeIcon size={16} weight="bold" />
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner sideOffset={4} align="end">
					<Menu.Popup className="min-w-24 bg-bg border border-border rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.15)] z-[100] overflow-hidden transition-[opacity,transform] duration-150 data-[starting-style]:opacity-0 data-[starting-style]:-translate-y-1 data-[ending-style]:opacity-0 data-[ending-style]:-translate-y-1">
						<Menu.Item
							className="inline-flex items-center gap-1 w-full py-2 px-3 border-none bg-transparent text-left text-sm text-text cursor-pointer transition-colors hover:bg-bg-secondary dark:hover:bg-bg-tertiary data-[highlighted]:bg-bg-secondary dark:data-[highlighted]:bg-bg-tertiary"
							onClick={onEdit}
						>
							<PencilIcon />
							<span>Edit</span>
						</Menu.Item>
						<Menu.Separator className="h-px bg-border" />
						<Menu.Item
							className="inline-flex items-center gap-1 w-full py-2 px-3 border-none bg-transparent text-left text-sm text-danger cursor-pointer transition-colors hover:bg-danger/8 data-[highlighted]:bg-danger/8"
							onClick={onDelete}
						>
							<TrashIcon />
							<span>Delete</span>
						</Menu.Item>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
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
		<table className="w-full border-separate border-spacing-0 bg-bg border border-border rounded-lg">
			<thead>
				<tr>
					<th className="py-2.5 px-3 text-left bg-bg font-semibold text-xs uppercase tracking-wide text-text-secondary border-b border-border first:rounded-tl-[7px]">
						Key
					</th>
					<th className="py-2.5 px-3 text-left bg-bg font-semibold text-xs uppercase tracking-wide text-text-secondary border-b border-border">
						Value
					</th>
					<th className="py-2.5 px-3 text-left bg-bg font-semibold text-xs uppercase tracking-wide text-text-secondary border-b border-border w-12 last:rounded-tr-[7px]"></th>
				</tr>
			</thead>
			<tbody>
				{entries.map((entry, index) => {
					const isEditing = editData?.originalKey === entry.key.name;
					const isLast = index === entries.length - 1;
					return (
						<tr key={entry.key.name} className="group hover:bg-bg-tertiary">
							<td
								className={cn(
									"py-2 px-3 text-left align-top group/cell",
									isLast
										? "border-b-0 first:rounded-bl-[7px]"
										: "border-b border-border"
								)}
							>
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
												"w-full font-mono bg-bg text-text min-h-8 py-1.5 px-2 text-[13px] border border-primary rounded focus:outline-none focus:shadow-focus-primary disabled:bg-bg-secondary disabled:text-text-secondary",
												{
													"border-danger focus:shadow-focus-danger":
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
											<span className="text-danger text-xs mt-1">
												{editData.keyError}
											</span>
										)}
									</div>
								) : (
									<div className="group/cell flex items-center gap-1.5">
										<code className="text-primary font-medium">
											{entry.key.name}
										</code>
										<CopyButton text={entry.key.name} />
									</div>
								)}
							</td>
							<td
								className={cn(
									"py-2 px-3 text-left max-w-[400px] font-mono text-[13px] group/cell",
									isLast ? "border-b-0" : "border-b border-border"
								)}
							>
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
											className="w-full font-mono bg-bg text-text min-h-8 py-1.5 px-2 text-[13px] border border-primary rounded focus:outline-none focus:shadow-focus-primary disabled:bg-bg-secondary disabled:text-text-secondary max-h-[200px] resize-none overflow-y-auto [field-sizing:content]"
											value={editData.value}
											onChange={(e) =>
												setEditData({ ...editData, value: e.target.value })
											}
											onKeyDown={handleKeyDown}
											disabled={saving}
										/>
										<div className="flex justify-end gap-1.5">
											<Button
												className="inline-flex items-center justify-center py-1 px-2.5 text-xs font-medium border-none rounded-md cursor-pointer transition-[background-color,transform] active:translate-y-px bg-bg-tertiary text-text border border-border hover:bg-border data-[disabled]:opacity-60 data-[disabled]:cursor-not-allowed data-[disabled]:active:translate-y-0"
												onClick={handleCancel}
												disabled={saving}
											>
												Cancel
											</Button>
											<Button
												className="inline-flex items-center justify-center py-1 px-2.5 text-xs font-medium border-none rounded-md cursor-pointer transition-[background-color,transform] active:translate-y-px bg-primary text-white hover:bg-primary-hover data-[disabled]:text-white/70 data-[disabled]:cursor-not-allowed data-[disabled]:active:translate-y-0"
												onClick={handleSave}
												disabled={saving || isKeyInvalid}
												focusableWhenDisabled
											>
												{saving ? "Saving..." : "Save"}
											</Button>
										</div>
									</div>
								) : (
									<div className="flex items-center gap-1.5 min-w-0">
										<span
											className={cn(
												"overflow-hidden text-ellipsis whitespace-nowrap min-w-0",
												{
													"text-text-secondary": !entry.value,
												}
											)}
										>
											{formatValue(entry.value)}
										</span>
										{entry.value && <CopyButton text={entry.value} />}
									</div>
								)}
							</td>
							<td
								className={cn(
									"py-2 px-3 whitespace-nowrap text-right",
									isLast
										? "border-b-0 last:rounded-br-[7px]"
										: "border-b border-border"
								)}
							>
								{!isEditing && (
									<ActionMenu
										onEdit={() => handleStartEdit(entry)}
										onDelete={() => void onDelete(entry.key.name)}
									/>
								)}
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}
