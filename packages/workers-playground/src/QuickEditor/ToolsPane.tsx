import { A, Div } from "@cloudflare/elements";
import { createComponent } from "@cloudflare/style-container";

import SplitPane from "./SplitPane";
import { TabBar, Tab, TabList, Tabs, TabPanel } from "./TabBar";
import PreviewTab from "./PreviewTab/PreviewTab";
import DevtoolsIframe from "./DevtoolsIframe";
import { HTTPTab } from "./HTTPTab/HTTPTab";
import { Icon } from "@cloudflare/component-icon";
import { isDarkMode, theme } from "@cloudflare/style-const";
const Main = createComponent(() => ({
	display: "flex",
	flexDirection: "column",
	position: "absolute",
	left: 0,
	width: "100%",
	height: "100%",
}));

export default function ToolsPane() {
	return (
		<SplitPane split="horizontal" defaultSize="70%" minSize={50} maxSize={-50}>
			<Div width="100%">
				<Main>
					<Tabs defaultIndex={0} forceRenderTabPanel={true}>
						<TabBar>
							<TabList className="worker-editor-tablist">
								<Tab>
									<Icon type="eye" mr={2} />
									Preview
								</Tab>
								<Tab>
									<Icon type="two-way" mr={2} />
									HTTP
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
									href={`https://discord.gg/cloudflaredev`}
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

						<TabPanel>
							<PreviewTab />
						</TabPanel>
						<TabPanel>
							<HTTPTab />
						</TabPanel>
					</Tabs>
				</Main>
			</Div>
			<DevtoolsIframe />
		</SplitPane>
	);
}
