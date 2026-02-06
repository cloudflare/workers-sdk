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
	"lower",
	"ltrim",
	"rtrim",
	"max",
	"min",
	"hex",
	"length",
	"substr",
	"upper",
	"unicode",
	"sign",
	"soundex",
	"random",
];

const WAEScalarFunctions = [
	"intdiv",
	"touint32",
	"length",
	"isempty",
	"tolower",
	"toupper",
	"startswith",
	"endswith",
	"position",
	"substring",
	"format",
	"todatetime",
	"now",
	"tounixtimestamp",
	"formatdatetime",
	"tostartofinterval",
	"extract",
];

export function StudioWhereFilterInput({
	columnNameList,
	onApply,
	value,
	loading,
	driver,
}: {
	value: string;
	columnNameList: string[];
	onApply: (whereRaw: string) => void;
	loading?: boolean;
	driver: IStudioDriver;
}) {
	const editorRef = useRef<StudioCodeMirrorReference>(null);
	const [currentValue, setCurrentValue] = useState("");
	const [parsingError, setParsingError] = useState("");

	const availableFunctionList = useMemo(() => {
		return driver.dialect === "wae"
			? WAEScalarFunctions
			: SQLiteScalarFunctions;
	}, [driver]);

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
			} catch (e) {
				setParsingError(e.toString());
			}
		}, 1000);
		return () => clearTimeout(timeoutId);
	}, [currentValue, columnNameList, availableFunctionList]);

	const onExternalApply = useCallback(() => {
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
			} catch (e) {
				alert(e.toString());
				setParsingError(e.toString());
			}
		}
	}, [onApply, editorRef, columnNameList, availableFunctionList]);

	const onValueChange = useCallback(() => {
		if (editorRef.current) {
			setCurrentValue(editorRef.current.getValue());
		}
	}, [editorRef]);

	const applyButtonContent = useMemo(() => {
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
				<span className="text-neutral-500">●</span>
				<span>Apply</span>
			</>
		);
	}, [loading, currentValue, value, parsingError]);

	return (
		<div className="border-border bg-surface-secondary border rounded flex items-center">
			<StudioSQLWhereEditor
				ref={editorRef}
				defaultValue={value}
				className="w-full p-1"
				columnNames={columnNameList}
				functionNames={availableFunctionList}
				onChange={onValueChange}
				placeholder="eg: id = 10"
				onEnterPressed={onExternalApply}
			/>
			<Tooltip content={parsingError} asChild>
				<Button
					size="sm"
					style={{ marginLeft: 5, marginRight: 5 }}
					onClick={onExternalApply}
					disabled={loading || !!parsingError}
				>
					{applyButtonContent}
				</Button>
			</Tooltip>
		</div>
	);
}
