import { Button } from "@base-ui/react/button";
import { Input } from "@base-ui/react/input";
import { Menu } from "@base-ui/react/menu";
import { useState } from "react";
import DotsIcon from "../assets/icons/dots.svg?react";
import { CopyButton } from "./CopyButton";
import type { KVEntry } from "../api";

interface KVTableProps {
	entries: KVEntry[];
	onSave: (originalKey: string, newKey: string, value: string) => Promise<void>;
	onDelete: (keyName: string) => void;
}

function formatValue(value: string | null, maxLength = 100): string {
	if (!value) {
		return "(null)";
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
				<DotsIcon />
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
}

export function KVTable({ entries, onSave, onDelete }: KVTableProps) {
	const [editing, setEditing] = useState<EditingState | null>(null);
	const [saving, setSaving] = useState(false);

	const handleStartEdit = (entry: KVEntry) => {
		setEditing({
			originalKey: entry.key.name,
			key: entry.key.name,
			value: entry.value ?? "",
		});
	};

	const handleSave = async () => {
		if (!editing || !editing.key.trim()) {
			return;
		}

		try {
			setSaving(true);
			await onSave(editing.originalKey, editing.key, editing.value);
			setEditing(null);
		} catch {
			// Error handling done by parent
		} finally {
			setSaving(false);
		}
	};

	const handleCancel = () => {
		setEditing(null);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			handleCancel();
		} else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			void handleSave();
		}
	};

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
					const isEditing = editing?.originalKey === entry.key.name;
					return (
						<tr key={entry.key.name}>
							<td className="key-cell">
								{isEditing && editing ? (
									<Input
										className="inline-edit-input"
										value={editing.key}
										onChange={(e) =>
											setEditing({ ...editing, key: e.target.value })
										}
										onKeyDown={handleKeyDown}
										disabled={saving}
										autoFocus
									/>
								) : (
									<div className="cell-with-copy">
										<code>{entry.key.name}</code>
										<CopyButton text={entry.key.name} />
									</div>
								)}
							</td>
							<td className="value-cell">
								{isEditing && editing ? (
									<div className="inline-edit-cell">
										<textarea
											className="inline-edit-textarea"
											value={editing.value}
											onChange={(e) =>
												setEditing({ ...editing, value: e.target.value })
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
												disabled={saving || !editing.key.trim()}
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
