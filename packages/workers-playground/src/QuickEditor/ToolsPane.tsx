import { Icon } from "@cloudflare/component-icon";
import { A, Div } from "@cloudflare/elements";
import { isDarkMode, theme } from "@cloudflare/style-const";
import { createComponent } from "@cloudflare/style-container";
import { SplitPane } from "@cloudflare/workers-editor-shared";
import { useState } from "react";
import DevtoolsIframe from "./DevtoolsIframe";
import { HTTPTab } from "./HTTPTab/HTTPTab";
import MigrateToWrangler from "./MigrateToWrangler/MigrateToWrangler";
import PreviewTab from "./PreviewTab/PreviewTab";
import { Tab, TabBar, TabList, TabPanel, Tabs } from "./TabBar";

const Main = createComponent(() => ({
	display: "flex",
	flexDirection: "column",
	position: "absolute",
	left: 0,
	width: "100%",
	height: "100%",
}));

export default function ToolsPane() {
	const [isSafari] = useState(
		() =>
			/Safari\/\d+/.test(navigator.userAgent) &&
			!/Chrome\/\d+/.test(navigator.userAgent)
	);
	return (
		<SplitPane split="horizontal" defaultSize="70%" minSize={50} maxSize={-50}>
			<Div width="100%">
				<Main>
					<Tabs defaultIndex={0} forceRenderTabPanel={true}>
						<TabBar>
							<TabList className="worker-editor-tablist">
								{!isSafari && (
									<Tab>
										<Icon type="eye" mr={2} />
										Preview
									</Tab>
								)}
								<Tab>
									<Icon type="two-way" mr={2} />
									HTTP
								</Tab>
								<Tab>
									<Icon type="wrangler" />
								</Tab>
							</TabList>
							<Div
								display="flex"
								justifyContent="flex-end"
								alignItems="center"
								width="100%"
								height="100%"
								pr={3}
								gap={2}
							>
								<A
									title="Open Worker’s documentation"
									target="_blank"
									display={"inline-flex"}
									href={`https://developers.cloudflare.com/workers`}
								>
									<Icon
										type="documentation"
										size={20}
										color={
											isDarkMode() ? theme.colors.black : theme.colors.gray[5]
										}
									></Icon>
								</A>
								<A
									title="Join Cloudflare’s developer Discord"
									target="_blank"
									display={"inline-flex"}
									href={`https://discord.cloudflare.com`}
								>
									<Icon
										type="discord"
										size={20}
										color={
											isDarkMode() ? theme.colors.black : theme.colors.gray[5]
										}
									></Icon>
								</A>
							</Div>
						</TabBar>

						{!isSafari && (
							<TabPanel>
								<PreviewTab />
							</TabPanel>
						)}
						<TabPanel>
							<HTTPTab />
						</TabPanel>
						<TabPanel scrollable>
							<MigrateToWrangler />
						</TabPanel>
					</Tabs>
				</Main>
			</Div>
			<DevtoolsIframe />
		</SplitPane>
	);
}
