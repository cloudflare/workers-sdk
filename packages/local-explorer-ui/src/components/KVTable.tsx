import { Button } from "@base-ui/react/button";
import { Menu } from "@base-ui/react/menu";
import { DotsThreeIcon } from "@phosphor-icons/react";
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
			<Menu.Trigger className="action-menu-trigger" aria-label="Actions">
				<DotsThreeIcon size={16} weight="bold" />
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner sideOffset={4} align="end">
					<Menu.Popup className="action-menu-dropdown">
						<Menu.Item className="action-menu-item" onClick={onEdit}>
							Edit
						</Menu.Item>
						<Menu.Separator className="action-menu-separator" />
						<Menu.Item
							className="action-menu-item action-menu-item-danger"
							onClick={onDelete}
						>
							Delete
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
		<table className="table">
			<thead>
				<tr>
					<th>Key</th>
					<th>Value</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{entries.map((entry) => {
					const isEditing = editData?.originalKey === entry.key.name;
					return (
						<tr key={entry.key.name}>
							<td className="key-cell">
								{isEditing && editData ? (
									<div className="kv-field">
										<label
											className="sr-only"
											htmlFor={`edit-key-${entry.key.name}`}
										>
											Key
										</label>
										<input
											id={`edit-key-${entry.key.name}`}
											className={`kv-input kv-input--edit${editData.keyError ? " kv-input--invalid" : ""}`}
											value={editData.key}
											onChange={(e) => handleKeyChange(e.target.value)}
											onKeyDown={handleKeyDown}
											disabled={saving}
											autoFocus
										/>
										{editData.keyError && (
											<span className="field-error">{editData.keyError}</span>
										)}
									</div>
								) : (
									<div className="cell-with-copy">
										<code>{entry.key.name}</code>
										<CopyButton text={entry.key.name} />
									</div>
								)}
							</td>
							<td className="value-cell">
								{isEditing && editData ? (
									<div className="inline-edit-cell">
										<label
											className="sr-only"
											htmlFor={`edit-value-${entry.key.name}`}
										>
											Value
										</label>
										<textarea
											id={`edit-value-${entry.key.name}`}
											className="kv-input kv-input--edit kv-input--textarea"
											value={editData.value}
											onChange={(e) =>
												setEditData({ ...editData, value: e.target.value })
											}
											onKeyDown={handleKeyDown}
											disabled={saving}
										/>
										<div className="inline-edit-actions">
											<Button
												className="btn btn-secondary"
												onClick={handleCancel}
												disabled={saving}
											>
												Cancel
											</Button>
											<Button
												className="btn btn-primary"
												onClick={handleSave}
												disabled={saving || isKeyInvalid}
												focusableWhenDisabled
											>
												{saving ? "Saving..." : "Save"}
											</Button>
										</div>
									</div>
								) : (
									<div className="cell-with-copy">
										<span className={!entry.value ? "text-muted" : ""}>
											{formatValue(entry.value)}
										</span>
										{entry.value && <CopyButton text={entry.value} />}
									</div>
								)}
							</td>
							<td className="actions-cell">
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
