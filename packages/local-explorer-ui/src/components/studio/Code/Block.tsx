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
			className="overflow-auto rounded bg-kumo-elevated p-3 font-mono text-sm"
			data-language={language}
			style={maxHeight ? { maxHeight } : undefined}
		>
			<code>{code}</code>
		</pre>
	);
}
