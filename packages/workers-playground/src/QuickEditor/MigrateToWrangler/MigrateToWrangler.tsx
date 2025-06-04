import CodeBlock from "@cloudflare/component-code-block";
import { Heading } from "@cloudflare/component-heading";
import { A, Div, Li, Ol, P, Ul } from "@cloudflare/elements";
import { DocsLink } from "./DocsLink";
import { StepNumber } from "./StepNumber";

export function MigrateToWranglerGuide() {
	return (
		<Div display="flex" flexDirection="column" mx="auto" width="90%" py={4}>
			<>
				<Div fontSize={4} fontWeight={700}>
					Develop with Wrangler CLI
				</Div>
				<Div display="flex" flexDirection="column" maxWidth={700}>
					<Div display="flex" alignItems="baseline" flexWrap="wrap" mt={3}>
						<P>
							Build, preview, and deploy your Workers from the Wrangler command
							line interface (CLI). Once set up, you’ll be able to quickly
							iterate on Worker code and configuration from your local
							development environment.
							<DocsLink
								ml={2}
								href="https://developers.cloudflare.com/workers/wrangler/"
							>
								Using Wrangler CLI
							</DocsLink>
						</P>
					</Div>
					<Ol ml={0} mt={4} listStyle="none" p={0}>
						<Li my={3} display="flex">
							<StepNumber number={1} active={true} />

							<Div ml={2} flex="1">
								<Heading size={4}>Initialise a new project</Heading>

								<P>
									<CodeBlock
										code={`$ npx create-cloudflare@latest`}
										language="sh"
									/>
								</P>
							</Div>
						</Li>
						<Li my={2} display="flex">
							<StepNumber number={2} active={true} />

							<Div ml={2} flex="1">
								<Heading size={4}>Deploy your project </Heading>
								<P>
									You&apos;ll be asked to deploy via the create-cloudflare CLI.
									Choose &apos;yes&apos; and your project will deploy.
								</P>
							</Div>
						</Li>
					</Ol>
					<Div ml={3} mb={4}>
						<Heading size={4}>That’s it! 🎉 </Heading>
						<P mt={3}>
							You’ve now deployed your project via the CLI. To support you along
							your journey developing with Cloudflare&apos;s CLI tool, Wrangler,
							here are some resources:
						</P>
						<Ul mt={3} pl={0} ml={0} listStyle="none">
							<Li mb={2}>
								<A href="https://developers.cloudflare.com/workers/wrangler/commands/">
									Wrangler Commands
								</A>
							</Li>
							<Li mb={2}>
								<A href="https://developers.cloudflare.com/workers/cli-wrangler/configuration#keys">
									wrangler.toml Config
								</A>
							</Li>
						</Ul>
					</Div>
				</Div>
			</>
		</Div>
	);
}

export default MigrateToWranglerGuide;
