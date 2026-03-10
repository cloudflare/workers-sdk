import { cn, Switch, Text } from "@cloudflare/kumo";
import type { StudioExportOption } from "../../../../types/studio";
import type {
	ChangeEvent,
	Dispatch,
	PropsWithChildren,
	SetStateAction,
} from "react";

interface StudioExportOptionProps {
	onChange: Dispatch<SetStateAction<StudioExportOption>>;
	value: StudioExportOption;
}

export function StudioExportOptionEditor({
	onChange,
	value,
}: StudioExportOptionProps): JSX.Element {
	return (
		<>
			<SettingItem>
				<SettingLabel>Format</SettingLabel>
				<SettingOption>
					<SettingOptionDropdown
						value={value.type}
						items={{
							CSV: "CSV",
							SQL: "SQL",
						}}
						onChange={(newValue): void => {
							const type = newValue as StudioExportOption["type"];
							onChange((prev) => ({
								...prev,
								type,
								filename: type === "CSV" ? "export.csv" : "export.sql",
							}));
						}}
					/>
				</SettingOption>
			</SettingItem>

			{value.type === "CSV" && (
				<CSVExportEditor value={value} onChange={onChange} />
			)}

			{value.type === "SQL" && (
				<SQLExportEditor value={value} onChange={onChange} />
			)}

			<SettingItem lastItem>
				<SettingLabel>Filename</SettingLabel>
				<SettingOption>
					<input
						className="w-full rounded-md border border-border px-3 py-2 text-sm font-mono"
						onChange={(e): void => {
							onChange((prev) => ({
								...prev,
								filename: e.target.value,
							}));
						}}
						spellCheck={false}
						value={value.filename}
					/>
				</SettingOption>
			</SettingItem>
		</>
	);
}

interface SQLExportEditorProps {
	onChange: Dispatch<SetStateAction<StudioExportOption>>;
	value: StudioExportOption;
}

function SQLExportEditor({
	onChange,
	value,
}: SQLExportEditorProps): JSX.Element {
	return (
		<>
			<SettingItem>
				<SettingLabel>Batch Size</SettingLabel>
				<SettingOption>
					<input
						className="w-full rounded-md border border-border px-3 py-2 text-sm font-mono text-right"
						onChange={(e): void => {
							const batchSize = Number(e.target.value);
							if (isNaN(batchSize) || batchSize < 1) {
								return;
							}

							onChange((prev) => ({
								...prev,
								batchSize,
							}));
						}}
						spellCheck={false}
						type="number"
						min={1}
						value={value.batchSize}
					/>
				</SettingOption>
			</SettingItem>

			<SettingItem>
				<SettingLabel>
					<Text as="div">Max Statement Length</Text>
					<Text as="div" variant="secondary">
						The maximum length of a single statement in bytes.
					</Text>
				</SettingLabel>
				<SettingOption>
					<input
						className="w-full rounded-md border border-border px-3 py-2 text-sm font-mono text-right"
						onChange={(e): void => {
							const maxStatementLength = Number(e.target.value);
							if (isNaN(maxStatementLength) || maxStatementLength < 1) {
								return;
							}

							onChange((prev) => ({
								...prev,
								maxStatementLength,
							}));
						}}
						spellCheck={false}
						type="number"
						min={1}
						value={value.maxStatementLength}
					/>
				</SettingOption>
			</SettingItem>

			<SettingItem>
				<SettingLabel>Table Name</SettingLabel>
				<SettingOption>
					<input
						className="w-full rounded-md border border-border px-3 py-2 text-sm font-mono"
						onChange={(e): void => {
							onChange((prev) => ({
								...prev,
								tableName: e.target.value,
							}));
						}}
						spellCheck={false}
						value={value.tableName}
					/>
				</SettingOption>
			</SettingItem>
		</>
	);
}

interface CSVExportEditorProps {
	onChange: Dispatch<SetStateAction<StudioExportOption>>;
	value: StudioExportOption;
}

function CSVExportEditor({
	onChange,
	value,
}: CSVExportEditorProps): JSX.Element {
	return (
		<>
			<SettingItem>
				<SettingLabel>Include column name</SettingLabel>
				<SettingOption>
					<Switch
						checked={value.includeColumnName}
						onCheckedChange={(checked): void => {
							onChange((prev) => ({
								...prev,
								includeColumnName: checked,
							}));
						}}
					/>
				</SettingOption>
			</SettingItem>

			<SettingItem>
				<SettingLabel>Separator</SettingLabel>
				<SettingOption>
					<SettingOptionDropdown
						onChange={(newValue): void => {
							onChange((prev) => ({
								...prev,
								separator: newValue as StudioExportOption["separator"],
							}));
						}}
						items={{
							COMMA: "Comma (,)",
							SEMICOLON: "Semicolon (;)",
							TAB: "Tab",
						}}
						value={value.separator}
					/>
				</SettingOption>
			</SettingItem>

			<SettingItem>
				<SettingLabel>Line terminator</SettingLabel>
				<SettingOption>
					<SettingOptionDropdown
						onChange={(newValue): void => {
							onChange((prev) => ({
								...prev,
								lineTerminator:
									newValue as StudioExportOption["lineTerminator"],
							}));
						}}
						items={{
							CRLF: "Newline (CRLF)",
							LF: "Newline (LF)",
						}}
						value={value.lineTerminator}
					/>
				</SettingOption>
			</SettingItem>

			<SettingItem>
				<SettingLabel>Replacement for NULL Value</SettingLabel>
				<SettingOption>
					<SettingOptionDropdown
						onChange={(newValue): void => {
							onChange((prev) => ({
								...prev,
								nullValue: newValue as StudioExportOption["nullValue"],
							}));
						}}
						items={{
							EMPTY_STRING: "Empty string",
							NULL: "NULL",
						}}
						value={value.nullValue}
					/>
				</SettingOption>
			</SettingItem>
		</>
	);
}

interface SettingItemProps extends PropsWithChildren {
	lastItem?: boolean;
}

function SettingItem({ children, lastItem }: SettingItemProps): JSX.Element {
	return (
		<div
			className={cn(
				"min-h-14 items-center px-4 gap-4 flex justify-between",
				lastItem ? "" : "border-b border-border"
			)}
		>
			{children}
		</div>
	);
}

function SettingLabel({ children }: PropsWithChildren): JSX.Element {
	return <div className="font-medium py-2">{children}</div>;
}

function SettingOption({ children }: PropsWithChildren): JSX.Element {
	return <div>{children}</div>;
}

interface SettingOptionDropdownProps {
	items: Record<string, string>;
	onChange: (value: string) => void;
	value: string;
}

function SettingOptionDropdown({
	items,
	onChange,
	value,
}: SettingOptionDropdownProps): JSX.Element {
	return (
		<select
			className="rounded-md border border-border bg-transparent px-3 py-2 text-sm cursor-pointer"
			onChange={(e: ChangeEvent<HTMLSelectElement>): void => {
				onChange(e.target.value);
			}}
			value={value}
		>
			{Object.entries(items).map(([itemKey, itemValue]) => (
				<option key={itemKey} value={itemKey}>
					{itemValue}
				</option>
			))}
		</select>
	);
}
