import { Div } from "@cloudflare/elements";
import { createComponent } from "@cloudflare/style-container";

import SplitPane from "./SplitPane";
import { TabBar, Tab, TabList, Tabs, TabPanel } from "./TabBar";
import PreviewTab from "./PreviewTab/PreviewTab";
import DevtoolsIframe from "./DevtoolsIframe";
import { HTTPTab } from "./HTTPTab/HTTPTab";
import { Icon } from "@cloudflare/component-icon";
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
					<Tabs defaultIndex={1} forceRenderTabPanel={true}>
						<TabBar>
							<TabList className="worker-editor-tablist">
								<Tab>
									<Icon type="two-way" mr={2} />
									HTTP
								</Tab>
								<Tab>
									<Icon type="eye" mr={2} />
									Preview
								</Tab>
							</TabList>
							<Div
								display="flex"
								justifyContent="flex-end"
								alignItems="center"
								width="100%"
								height="100%"
								pr={2}
							>
								{/* <DocsLink href="https://developers.cloudflare.com/workers/examples">
                    <Trans id="worker_editor.examples" />
                  </DocsLink> */}
							</Div>
						</TabBar>

						<TabPanel>
							<HTTPTab />
						</TabPanel>
						<TabPanel>
							<PreviewTab />
						</TabPanel>
					</Tabs>
				</Main>
			</Div>
			<DevtoolsIframe />
		</SplitPane>
	);
}
