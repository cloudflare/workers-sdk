import { Button, Tooltip } from "@cloudflare/kumo";
import { SpinnerIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tokenizeSQL } from "../../utils/studio";
import { StudioWhereParser } from "../../utils/studio/where-parser";
import { StudioSQLWhereEditor } from "./SQLWhereEditor";
import type { IStudioDriver } from "../../types/studio";
import type { StudioCodeMirrorReference } from "./CodeMirror";

const SQLiteScalarFunctions = [
	"abs",
	"hex",
	"length",
	"lower",
	"ltrim",
	"max",
	"min",
	"random",
	"rtrim",
	"sign",
	"soundex",
	"substr",
	"unicode",
	"upper",
] satisfies string[];

const WAEScalarFunctions = [
	"endswith",
	"extract",
	"format",
	"formatdatetime",
	"intdiv",
	"isempty",
	"length",
	"now",
	"position",
	"startswith",
	"substring",
	"todatetime",
	"tolower",
	"tostartofinterval",
	"touint32",
	"tounixtimestamp",
	"toupper",
] satisfies string[];

interface StudioWhereFilterInputProps {
	columnNameList: string[];
	driver: IStudioDriver;
	loading?: boolean;
	onApply: (whereRaw: string) => void;
	value: string;
}

export function StudioWhereFilterInput({
	columnNameList,
	driver,
	loading,
	onApply,
	value,
}: StudioWhereFilterInputProps): JSX.Element {
	const editorRef = useRef<StudioCodeMirrorReference>(null);

	const [currentValue, setCurrentValue] = useState("");
	const [parsingError, setParsingError] = useState("");

	const availableFunctionList = useMemo<string[]>(
		() =>
			driver.dialect === "wae" ? WAEScalarFunctions : SQLiteScalarFunctions,
		[driver]
	);

	useEffect(() => {
		if (currentValue.trim() === "") {
			setParsingError("");
			return;
		}

		const timeoutId = setTimeout(() => {
			try {
				// Try to parse if it is valid where clause
				new StudioWhereParser({
					identifiers: columnNameList,
					functionNames: availableFunctionList,
					tokens: tokenizeSQL(currentValue, "sqlite"),
				}).parse();

				setParsingError("");
			} catch (err) {
				setParsingError(String(err));
			}
		}, 1_000);

		return () => clearTimeout(timeoutId);
	}, [currentValue, columnNameList, availableFunctionList]);

	const onExternalApply = useCallback((): void => {
		if (editorRef.current) {
			// Parse again before apply
			try {
				const appliedValue = editorRef.current.getValue();

				if (appliedValue === "") {
					return onApply("");
				}

				new StudioWhereParser({
					identifiers: columnNameList,
					functionNames: availableFunctionList,
					tokens: tokenizeSQL(appliedValue, "sqlite"),
				}).parse();

				setParsingError("");
				onApply(appliedValue);
			} catch (err) {
				alert(String(err));
				setParsingError(String(err));
			}
		}
	}, [onApply, editorRef, columnNameList, availableFunctionList]);

	const onValueChange = useCallback((): void => {
		if (editorRef.current) {
			setCurrentValue(editorRef.current.getValue());
		}
	}, [editorRef]);

	const applyButtonContent = useMemo<JSX.Element>(() => {
		if (loading) {
			return (
				<>
					<SpinnerIcon className="animate-spin" />
					<span>Applying</span>
				</>
			);
		}

		if (parsingError) {
			return (
				<>
					<span className="text-red-500">●</span>
					<span>Apply</span>
				</>
			);
		}

		if (currentValue === value) {
			return <span>Applied</span>;
		}

		return (
			<>
				<span className="text-muted">●</span>
				<span>Apply</span>
			</>
		);
	}, [loading, currentValue, value, parsingError]);

	return (
		<div className="border-border bg-surface-secondary border rounded flex items-center">
			<StudioSQLWhereEditor
				className="w-full p-1"
				columnNames={columnNameList}
				defaultValue={value}
				functionNames={availableFunctionList}
				onChange={onValueChange}
				onEnterPressed={onExternalApply}
				placeholder="eg: id = 10"
				ref={editorRef}
			/>
			<Tooltip content={parsingError} asChild>
				<Button
					disabled={loading || !!parsingError}
					onClick={onExternalApply}
					size="sm"
					style={{ marginLeft: 5, marginRight: 5 }}
				>
					{applyButtonContent}
				</Button>
			</Tooltip>
		</div>
	);
}
