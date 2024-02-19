import { Button } from "@cloudflare/component-button";
import { Icon } from "@cloudflare/component-icon";
import { Input } from "@cloudflare/component-input";
import { A, Div, Form, Span, Strong } from "@cloudflare/elements";
import { createComponent } from "@cloudflare/style-container";
import { useContext, useEffect, useState } from "react";
import { BAR_HEIGHT } from "./constants";
import { ServiceContext } from "./QuickEditor";
import { WorkersLogo } from "./WorkersLogo";

const Wrapper = createComponent(({ theme }) => ({
	display: "flex",
	alignItems: "center",
	borderBottom: `1px solid ${theme.colors.gray[7]}`,
	height: BAR_HEIGHT,
	gap: theme.space[2],
	paddingLeft: theme.space[3],
	paddingRight: theme.space[3],
	backgroundColor: theme.colors.white,
}));

export function TopBar() {
	const { previewHash } = useContext(ServiceContext);
	const [isEditing, setIsEditing] = useState(false);

	const [hasCopied, setHasCopied] = useState(false);

	const [value, _setValue] = useState(() => {
		const searchParams = new URLSearchParams(location.search);

		return searchParams.get("name") || "workers-playground";
	});

	function setValue(v: string) {
		const sanitised = v.replace(/[^a-z0-9-]+/g, "-");
		_setValue(sanitised);
	}

	function persistValue() {
		const searchParams = new URLSearchParams(location.search);
		searchParams.set("name", value);
		history.replaceState(
			null,
			"",
			`${location.pathname}?${searchParams.toString()}${location.hash}`
		);
	}
	useEffect(() => {
		if (hasCopied) {
			const timeout = setTimeout(() => setHasCopied(false), 3000);
			return () => clearTimeout(timeout);
		}
	}, [hasCopied]);
	return (
		<Wrapper>
			<A href="/" color="inherit">
				<WorkersLogo />
			</A>
			<A target="_blank" href="/playground">
				<Button ml={2} type="primary" inverted={true}>
					<Icon label="Add" type="plus" mr={1} />
					New
				</Button>
			</A>

			<Div ml="auto" mr="auto" display="flex" gap={1} alignItems="center">
				{isEditing ? (
					<Form
						display="contents"
						onSubmit={(e) => {
							e.preventDefault();
							persistValue();
							setIsEditing(false);
						}}
					>
						<Input
							name="path"
							value={value}
							autoComplete="off"
							autoFocus={true}
							spellCheck={false}
							onChange={(e) => setValue(e.target.value)}
							mb={0}
						/>
						<Button type="plain" submit={true} p={2} ml={1}>
							<Icon type="ok" />
						</Button>
					</Form>
				) : (
					<>
						<Strong>{value}</Strong>
						<Button
							type="plain"
							onClick={() => setIsEditing(true)}
							p={2}
							ml={1}
						>
							<Icon type="edit" />
						</Button>
					</>
				)}
			</Div>

			<Div position="relative">
				{hasCopied && (
					<Span
						height="100%"
						display="flex"
						gap={1}
						alignItems="center"
						mr={2}
						position="absolute"
						right="100%"
					>
						<Icon type="ok" color="green" size={20}></Icon>
						Copied!
					</Span>
				)}
				<Button
					type="primary"
					inverted={true}
					disabled={!Boolean(previewHash?.serialised)}
					onClick={() => {
						void navigator.clipboard.writeText(location.href);
						setHasCopied(!hasCopied);
					}}
				>
					<Icon label="Add" type="link" mr={1} />
					Copy Link
				</Button>
			</Div>

			<A
				target="_blank"
				href={`https://dash.cloudflare.com/workers-and-pages/deploy/playground/${value}#${previewHash?.serialised}`}
				style={previewHash?.serialised ? undefined : { pointerEvents: "none" }}
			>
				<Button
					type="primary"
					disabled={!Boolean(previewHash?.serialised)}
					tabIndex={-1}
				>
					Deploy
				</Button>
			</A>
		</Wrapper>
	);
}
