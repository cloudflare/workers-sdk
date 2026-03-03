interface CodeBlockProps {
	code: string;
	language?: string;
	maxHeight?: number;
}

export function CodeBlock({
	code,
	language,
	maxHeight,
}: CodeBlockProps): JSX.Element {
	return (
		<pre
			className="rounded bg-surface-secondary p-3 text-sm font-mono overflow-x-auto overflow-y-auto"
			data-language={language}
			style={maxHeight ? { maxHeight } : undefined}
		>
			<code>{code}</code>
		</pre>
	);
}
