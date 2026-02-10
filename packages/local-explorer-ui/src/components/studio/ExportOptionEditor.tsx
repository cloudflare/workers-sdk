import { Button, DropdownMenu, Input, Switch, Text } from "@cloudflare/kumo";
import { CaretUpDownIcon } from "@phosphor-icons/react";
import { produce } from "immer";
import type { StudioExportOption } from "../../utils/studio/export";
import type { Dispatch, PropsWithChildren, SetStateAction } from "react";

type StudioExportOptionProps = {
	value: StudioExportOption;
	onChange: Dispatch<SetStateAction<StudioExportOption>>;
};

const SeparatorMap: Record<StudioExportOption["separator"], string> = {
	COMMA: "Comma (,)",
	SEMICOLON: "Semicolon (;)",
	TAB: "Tab",
};

const LineTerminatorMap: Record<StudioExportOption["lineTerminator"], string> =
	{
		LF: "Newline (LF)",
		CRLF: "Newline (CRLF)",
	};

const StudioExportType: Record<StudioExportOption["type"], string> = {
	CSV: "CSV",
	SQL: "SQL",
};

const NullValueMap: Record<StudioExportOption["nullValue"], string> = {
	EMPTY_STRING: "Empty string",
	NULL: "NULL",
};

export function StudioExportOptionEditor({
	value,
	onChange,
}: StudioExportOptionProps) {
	return (
		<>
			<SettingItem>
				<SettingLabel>Format</SettingLabel>
				<SettingOption>
					<SettingOptionDropdown
						value={value.type}
						items={StudioExportType}
						onChange={(newValue) => {
							onChange((prev) =>
								produce(prev, (draft) => {
									draft.type = newValue as StudioExportOption["type"];
									draft.filename =
										newValue === "CSV" ? "export.csv" : "export.sql";
								})
							);
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
					<Input
						value={value.filename}
						onChange={(e) => {
							onChange((prev) =>
								produce(prev, (draft) => {
									draft.filename = e.target.value;
								})
							);
						}}
						spellCheck={false}
						className="font-mono"
					/>
				</SettingOption>
			</SettingItem>
		</>
	);
}

function SQLExportEditor({
	value,
	onChange,
}: {
	value: StudioExportOption;
	onChange: Dispatch<SetStateAction<StudioExportOption>>;
}) {
	return (
		<>
			<SettingItem>
				<SettingLabel>Batch Size</SettingLabel>
				<SettingOption>
					<Input
						value={value.batchSize}
						onChange={(e) => {
							onChange((prev) =>
								produce(prev, (draft) => {
									const batchSize = Number(e.target.value);
									if (isNaN(batchSize) || batchSize < 1) {
										return;
									}
									draft.batchSize = batchSize;
								})
							);
						}}
						spellCheck={false}
						className="font-mono text-right"
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
					<Input
						value={value.maxStatementLength}
						onChange={(e) => {
							onChange((prev) =>
								produce(prev, (draft) => {
									draft.maxStatementLength = Number(e.target.value);
								})
							);
						}}
						spellCheck={false}
						className="font-mono text-right"
					/>
				</SettingOption>
			</SettingItem>

			<SettingItem>
				<SettingLabel>Table Name</SettingLabel>
				<SettingOption>
					<Input
						value={value.tableName}
						onChange={(e) => {
							onChange((prev) =>
								produce(prev, (draft) => {
									draft.tableName = e.target.value;
								})
							);
						}}
						spellCheck={false}
						className="font-mono"
					/>
				</SettingOption>
			</SettingItem>
		</>
	);
}

function CSVExportEditor({
	value,
	onChange,
}: {
	value: StudioExportOption;
	onChange: Dispatch<SetStateAction<StudioExportOption>>;
}) {
	return (
		<>
			<SettingItem>
				<SettingLabel>Include column name</SettingLabel>
				<SettingOption>
					<Switch
						onClick={() => {
							onChange((prev) =>
								produce(prev, (draft) => {
									draft.includeColumnName = !draft.includeColumnName;
								})
							);
						}}
						checked={value.includeColumnName}
					/>
				</SettingOption>
			</SettingItem>

			<SettingItem>
				<SettingLabel>Separator</SettingLabel>
				<SettingOption>
					<SettingOptionDropdown
						value={value.separator}
						items={SeparatorMap}
						onChange={(newValue) => {
							onChange((prev) =>
								produce(prev, (draft) => {
									draft.separator = newValue as StudioExportOption["separator"];
								})
							);
						}}
					/>
				</SettingOption>
			</SettingItem>

			<SettingItem>
				<SettingLabel>Line terminator</SettingLabel>
				<SettingOption>
					<SettingOptionDropdown
						value={value.lineTerminator}
						items={LineTerminatorMap}
						onChange={(newValue) => {
							onChange((prev) =>
								produce(prev, (draft) => {
									draft.lineTerminator =
										newValue as StudioExportOption["lineTerminator"];
								})
							);
						}}
					/>
				</SettingOption>
			</SettingItem>

			<SettingItem>
				<SettingLabel>Replacement for NULL Value</SettingLabel>
				<SettingOption>
					<SettingOptionDropdown
						value={value.nullValue}
						items={NullValueMap}
						onChange={(newValue) => {
							onChange((prev) =>
								produce(prev, (draft) => {
									draft.nullValue = newValue as StudioExportOption["nullValue"];
								})
							);
						}}
					/>
				</SettingOption>
			</SettingItem>
		</>
	);
}

function SettingItem({
	children,
	lastItem,
}: PropsWithChildren<{ lastItem?: boolean }>) {
	return (
		<div
			className={`min-h-14 items-center px-4 flex justify-between ${
				lastItem ? "" : "border-b border-color"
			}`}
		>
			{children}
		</div>
	);
}

function SettingLabel({ children }: PropsWithChildren) {
	return <div className="font-medium py-2">{children}</div>;
}

function SettingOption({ children }: PropsWithChildren) {
	return <div>{children}</div>;
}

function SettingOptionDropdown({
	value,
	items,
	onChange,
}: {
	value: string;
	items: Record<string, string>;
	onChange: (value: string) => void;
}) {
	return (
		<DropdownMenu modal={false}>
			<DropdownMenu.Trigger asChild>
				<Button variant="ghost" className="font-normal text-muted">
					{items[value]}
					<CaretUpDownIcon />
				</Button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content className="z-modal" align="end">
				{Object.entries(items).map(([key, label]) => (
					<DropdownMenu.Item
						key={key}
						onSelect={() => {
							onChange(key);
						}}
					>
						{label}
					</DropdownMenu.Item>
				))}
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}
