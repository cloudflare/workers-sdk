import { Button, Tooltip } from "@cloudflare/kumo";
import { SpinnerIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tokenizeSQL } from "../../../utils/studio/sql";
import { StudioWhereParser } from "../../../utils/studio/where-parser";
import { StudioSQLWhereEditor } from "./Editor";
import type { IStudioDriver } from "../../../types/studio";
import type { StudioCodeMirrorReference } from "../Code/Mirror";

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

interface StudioWhereFilterInputProps {
	columnNameList: string[];
	driver: IStudioDriver;
	loading?: boolean;
	onApply: (whereRaw: string) => void;
	value: string;
}

export function StudioWhereFilterInput({
	columnNameList,
	loading,
	onApply,
	value,
}: StudioWhereFilterInputProps): JSX.Element {
	const editorRef = useRef<StudioCodeMirrorReference>(null);

	const [currentValue, setCurrentValue] = useState<string>("");
	const [parsingError, setParsingError] = useState<string>("");

	const availableFunctionList = useMemo<string[]>(
		() => SQLiteScalarFunctions,
		[]
	);

	useEffect(() => {
		if (currentValue.trim() === "") {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronous state reset before setting up debounce timer is intentional cleanup logic
			setParsingError("");
			return;
		}

		const timeoutId = setTimeout(() => {
			try {
				// Try to parse if it is valid where clause
				new StudioWhereParser({
					functionNames: availableFunctionList,
					identifiers: columnNameList,
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
					functionNames: availableFunctionList,
					identifiers: columnNameList,
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
					className="mx-1.25"
					disabled={loading || !!parsingError}
					onClick={onExternalApply}
					size="sm"
				>
					{applyButtonContent}
				</Button>
			</Tooltip>
		</div>
	);
}
