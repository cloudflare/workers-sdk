# Cloudflare Workers with itty-router Template

Utilize the `itty-router` package to efficiently add routing to your Cloudflare Workers with this straightforward template.

## Setup

Creating a new project is a breeze. Simply follow these steps:

1. Clone this repository or download the provided zip file.
2. Open your terminal and navigate to the project directory using `cd path/to/your-project`.
3. Execute the command below to scaffold your project:

```bash
$ npx create worker-itty-router my-project

Ensure to replace my-project with your project's desired name.

Before pushing your code, remember to personalize the wrangler.toml file with your unique Cloudflare account_id. You can find more guidance on configuration and deployment in our documentation.

Deployment
When you're set to launch your project, deploy it by running:

$ npm run deploy
# Alternatively, use yarn or pnpm
$ yarn run deploy
$ pnpm run deploy

This command will upload your project to Cloudflare Workers and get it live!

Contributing
Stumbled upon a bug or have a feature in mind? We encourage contributions. Simply open a pull request or submit an issue on GitHub. We appreciate your input!

Happy coding!