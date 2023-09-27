import { useEffect, useState } from "react";
import { A, Div, Form, Span, Strong } from "@cloudflare/elements";
import { createComponent } from "@cloudflare/style-container";
import { Button } from "@cloudflare/component-button";
import { Icon } from "@cloudflare/component-icon";
import { BAR_HEIGHT } from "./constants";
import { WorkersLogo } from "./WorkersLogo";
import { Input } from "@cloudflare/component-input";
import { Toast } from "@cloudflare/component-toast";

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

const AnimatedToast = createComponent(
	({ theme }) => ({
		position: "fixed",
		right: theme.space[3],
		top: `calc(${BAR_HEIGHT}px + ${theme.space[1] + theme.space[2]}px)`,
		zIndex: 10,
		display: "flex",
		alignItems: "center",
		gap: theme.space[2],
	}),
	Toast
);

export function TopBar() {
	const [isEditing, setIsEditing] = useState(false);

	const [hasCopied, setHasCopied] = useState(false);

	const [value, _setValue] = useState(() => {
		const searchParams = new URLSearchParams(location.search);

		return searchParams.get("name") || "workers-playground";
	});

	const workerHash = location.hash.slice(1);

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
				href={`https://dash.cloudflare.com/workers-and-pages/deploy/playground/${value}#${workerHash}`}
				style={workerHash ? undefined : { pointerEvents: "none" }}
			>
				<Button type="primary" disabled={!Boolean(workerHash)} tabIndex={-1}>
					Deploy
				</Button>
			</A>
		</Wrapper>
	);
}
