// NOTE: The provided option-value completions can be customized or removed as needed.
// NOTE: Descriptions and flags based on https://developers.cloudflare.com/workers/wrangler/commands/

import t from "@bomb.sh/tab";

export function setupCompletions() {
	// Global flags that work on every command
	t.option("help", "Show help");
	t.option("h", "Alias for --help");
	t.option("config", "Path to Wrangler configuration file");
	t.option("c", "Alias for --config");
	t.option("cwd", "Run as if Wrangler was started in the specified directory");
	t.option("env", "Environment to use for operations and selecting .env/.dev.vars files");
	t.option("e", "Alias for --env");
	t.option("env-file", "Path to .env file to load (can be specified multiple times)");
	t.option("version", "Show version number");
	t.option("v", "Alias for --version");

	// wrangler docs
	t.command("docs", "📚 Open Wrangler's command documentation in your browser");

	// wrangler init
	const init = t.command("init", "📥 Initialize a basic Worker");
	init.option("yes", "Answer yes to all questions");
	init.option("from-dash", "Initialize a Worker from the Cloudflare dashboard");

	// wrangler dev - Start a local server for developing your Worker
	const dev = t.command("dev", "👂 Start a local server for developing your Worker");
	dev.option("name", "Name of the Worker");
	dev.option("port", "Port to listen on", (complete) => {
		complete("8787", "Default Wrangler port");
		complete("3000", "Alternative port");
		complete("8080", "Alternative port");
	});
	dev.option("ip", "IP address to listen on", (complete) => {
		complete("0.0.0.0", "All interfaces");
		complete("127.0.0.1", "Localhost only");
	});
	dev.option("inspector-port", "Port for devtools to connect to");
	dev.option("compatibility-date", "Date in yyyy-mm-dd format for Workers runtime version");
	dev.option("compatibility-flags", "Flags to use for compatibility checks");
	dev.option("compatibility-flag", "Alias for compatibility-flags");
	dev.option("latest", "Use the latest version of the Workers runtime");
	dev.option("assets", "Folder of static assets to be served");
	dev.option("no-bundle", "Skip internal build steps");
	dev.option("env", "Perform on a specific environment");
	dev.option("var", "Inject key:value pairs as variables");
	dev.option("define", "Replace global identifiers in your code");
	dev.option("tsconfig", "Path to a custom tsconfig.json file");
	dev.option("minify", "Minify the script");
	dev.option("persist-to", "Specify directory to use for local persistence");
	dev.option("remote", "Develop against remote resources on Cloudflare's network");
	dev.option("test-scheduled", "Expose /__scheduled route for testing Cron Triggers");
	dev.option("log-level", "Specify Wrangler's logging level", (complete) => {
		complete("debug", "Debug level logging");
		complete("info", "Info level logging");
		complete("log", "Log level logging");
		complete("warn", "Warning level logging");
		complete("error", "Error level logging");
		complete("none", "No logging");
	});
	dev.option("show-interactive-dev-session", "Show interactive dev session");
	dev.option("alias", "Specify modules to alias using module aliasing");

	// wrangler deploy - Deploy your Worker to Cloudflare
	const deploy = t.command("deploy", "🆙 Deploy a Worker to Cloudflare");
	deploy.option("name", "Name of the Worker");
	deploy.option("no-bundle", "Skip internal build steps");
	deploy.option("env", "Perform on a specific environment");
	deploy.option("outdir", "Path to directory where Wrangler will write bundled Worker files");
	deploy.option("compatibility-date", "Date in yyyy-mm-dd format for Workers runtime version");
	deploy.option("compatibility-flags", "Flags to use for compatibility checks");
	deploy.option("compatibility-flag", "Alias for compatibility-flags");
	deploy.option("latest", "Use the latest version of the Workers runtime");
	deploy.option("assets", "Folder of static assets to be served");
	deploy.option("var", "Inject key:value pairs as variables");
	deploy.option("define", "Replace global identifiers in your code");
	deploy.option("triggers", "Cron schedules to attach");
	deploy.option("schedule", "Alias for triggers");
	deploy.option("schedules", "Alias for triggers");
	deploy.option("routes", "Routes where this Worker will be deployed");
	deploy.option("route", "Alias for routes");
	deploy.option("tsconfig", "Path to a custom tsconfig.json file");
	deploy.option("minify", "Minify the bundled Worker before deploying");
	deploy.option("dry-run", "Compile without deploying to live servers");
	deploy.option("keep-vars", "Prevent Wrangler from overriding environment variables");
	deploy.option("dispatch-namespace", "Workers for Platforms dispatch namespace");
	deploy.option("metafile", "Write build metadata from esbuild");

	// wrangler deployments - List and view deployments
	t.command("deployments", "🚢 List and view the current and past deployments for your Worker");
	t.command("deployments list", "List deployments");
	t.command("deployments status", "View deployment status");
	t.command("deployments view", "View deployment details");

	// wrangler rollback
	t.command("rollback", "🔙 Rollback a deployment for a Worker");

	// wrangler versions - Retrieve details for recent versions
	t.command("versions", "🫧 List, view, upload and deploy Versions of your Worker");
	t.command("versions view", "View a specific version");
	t.command("versions list", "List all versions");
	t.command("versions upload", "Upload a new version");
	t.command("versions deploy", "Deploy a version");
	t.command("versions secret", "Manage secrets for versions");
	t.command("versions secret put", "Add or update a secret");
	t.command("versions secret delete", "Delete a secret");
	t.command("versions secret list", "List all secrets");
	t.command("versions secret bulk", "Bulk operations on secrets");

	// wrangler delete
	t.command("delete", "🗑  Delete a Worker from Cloudflare");

	// wrangler tail - Start a log tailing session
	const tail = t.command("tail", "🦚 Start a session to livestream logs from a deployed Worker");
	tail.option("format", "Format for log output", (complete) => {
		complete("json", "JSON format");
		complete("pretty", "Pretty format");
	});
	tail.option("status", "Filter by invocation status", (complete) => {
		complete("ok", "Successful invocations");
		complete("error", "Failed invocations");
		complete("canceled", "Canceled invocations");
	});

	// wrangler secret - Manage the secret variables for a Worker
	t.command("secret", "🤫 Manage the secret variables for a Worker");
	t.command("secret put", "Create or update a secret");
	t.command("secret delete", "Delete a secret");
	t.command("secret list", "List all secrets");
	t.command("secret bulk", "Manage multiple secret variables for a Worker");

	// wrangler types - Generate types from bindings
	const types = t.command("types", "📝 Generate types from bindings and module rules in configuration");
	types.option("env-interface", "Name of the interface to generate for the environment object");
	types.option("include-runtime", "Generate runtime types based on compatibility settings");
	types.option("include-env", "Generate Env types based on Worker bindings");
	types.option("strict-vars", "Generate literal and union types for vars bindings");
	types.option("config", "Path(s) to Wrangler configuration file");

	// wrangler kv - Manage Workers KV Namespaces
	t.command("kv", "🗂️  Manage Workers KV Namespaces");
	t.command("kv namespace", "Manage Workers KV namespaces");
	t.command("kv namespace create", "Create a new KV namespace");
	t.command("kv namespace list", "List all KV namespaces");
	t.command("kv namespace delete", "Delete a KV namespace");
	t.command("kv namespace rename", "Rename a KV namespace");
	t.command("kv key", "Manage key-value pairs within a Workers KV namespace");
	t.command("kv key put", "Write a single key-value pair");
	t.command("kv key get", "Read a single value by key");
	t.command("kv key delete", "Remove a single key-value pair");
	t.command("kv key list", "List all keys in a namespace");
	t.command("kv bulk", "Manage multiple key-value pairs within a Workers KV namespace in batches");
	t.command("kv bulk put", "Write multiple key-value pairs");
	t.command("kv bulk get", "Read multiple values by keys");
	t.command("kv bulk delete", "Delete multiple key-value pairs");

	// wrangler queues - Configure Workers Queues
	t.command("queues", "📬 Configure Workers Queues");
	t.command("queues list", "List all queues");
	t.command("queues create", "Create a queue");
	t.command("queues delete", "Delete a queue");
	t.command("queues info", "Get queue information");
	t.command("queues update", "Update a queue");
	t.command("queues purge", "Purge messages from a queue");
	t.command("queues pause-delivery", "Pause queue delivery");
	t.command("queues resume-delivery", "Resume queue delivery");
	t.command("queues consumer", "Manage queue consumers");
	t.command("queues consumer add", "Add a consumer");
	t.command("queues consumer remove", "Remove a consumer");
	t.command("queues subscription", "Manage queue subscriptions");
	t.command("queues subscription create", "Create a subscription");
	t.command("queues subscription list", "List subscriptions");
	t.command("queues subscription delete", "Delete a subscription");

	// wrangler r2 - Manage Workers R2 buckets and objects
	t.command("r2", "📦 Manage Workers R2 buckets & objects");
	t.command("r2 bucket", "Manage R2 buckets");
	t.command("r2 bucket create", "Create a new R2 bucket");
	t.command("r2 bucket list", "List all R2 buckets");
	t.command("r2 bucket delete", "Delete an R2 bucket");
	t.command("r2 bucket info", "Get information about an R2 bucket");
	t.command("r2 bucket update", "Update R2 bucket settings");
	t.command("r2 bucket cors", "Manage CORS settings for an R2 bucket");
	t.command("r2 bucket lifecycle", "Manage lifecycle rules for an R2 bucket");
	t.command("r2 bucket domain", "Manage custom domains for an R2 bucket");
	t.command("r2 object", "Manage R2 objects");
	t.command("r2 object get", "Download an object from an R2 bucket");
	t.command("r2 object put", "Upload an object to an R2 bucket");
	t.command("r2 object delete", "Delete an object from an R2 bucket");

	// wrangler d1 - Interact with D1
	t.command("d1", "🗄  Manage Workers D1 databases");
	t.command("d1 create", "Create a D1 database");
	t.command("d1 list", "List all D1 databases");
	t.command("d1 delete", "Delete a D1 database");
	t.command("d1 info", "Get information about a D1 database");
	t.command("d1 execute", "Execute SQL queries against a D1 database");
	t.command("d1 export", "Export a D1 database");
	t.command("d1 migrations", "Manage D1 database migrations");
	t.command("d1 migrations list", "List all migrations");
	t.command("d1 migrations create", "Create a new migration");
	t.command("d1 migrations apply", "Apply pending migrations");

	// wrangler vectorize - Interact with Vectorize indexes
	t.command("vectorize", "🧮 Manage Vectorize indexes");
	t.command("vectorize create", "Create a Vectorize index");
	t.command("vectorize list", "List Vectorize indexes");
	t.command("vectorize delete", "Delete a Vectorize index");
	t.command("vectorize get", "Get information about a Vectorize index");
	t.command("vectorize insert", "Insert vectors into a Vectorize index");
	t.command("vectorize query", "Query vectors in a Vectorize index");

	// wrangler hyperdrive - Manage your Hyperdrives
	t.command("hyperdrive", "🚀 Manage Hyperdrive databases");
	t.command("hyperdrive create", "Create a Hyperdrive configuration");
	t.command("hyperdrive list", "List Hyperdrive configurations");
	t.command("hyperdrive delete", "Delete a Hyperdrive configuration");
	t.command("hyperdrive get", "Get a Hyperdrive configuration");
	t.command("hyperdrive update", "Update a Hyperdrive configuration");

	// wrangler pages - Configure Cloudflare Pages
	t.command("pages", "⚡️ Configure Cloudflare Pages");
	t.command("pages project", "Manage Pages projects");
	t.command("pages project create", "Create a Pages project");
	t.command("pages project list", "List Pages projects");
	t.command("pages project delete", "Delete a Pages project");
	t.command("pages dev", "Develop your full-stack Pages application locally");
	t.command("pages deploy", "Deploy a Pages project");
	t.command("pages deployment", "Manage Pages deployments");
	t.command("pages deployment list", "List deployments");
	t.command("pages deployment tail", "Tail deployment logs");

	// wrangler workflows - Manage and configure Workflows
	t.command("workflows", "🔁 Manage and configure Workflows");
	t.command("workflows list", "List workflows");
	t.command("workflows describe", "Describe a workflow");
	t.command("workflows trigger", "Trigger a workflow");
	t.command("workflows instances", "Manage workflow instances");
	t.command("workflows instances list", "List workflow instances");
	t.command("workflows instances describe", "Describe a workflow instance");
	t.command("workflows instances pause", "Pause a workflow instance");
	t.command("workflows instances resume", "Resume a workflow instance");
	t.command("workflows instances terminate", "Terminate a workflow instance");

	// wrangler pipelines - Configure Cloudflare Pipelines
	t.command("pipelines", "🚰 Configure Cloudflare Pipelines");

	// wrangler ai - Manage AI models
	t.command("ai", "🤖 Manage AI models");

	// wrangler dispatch-namespace - Interact with a dispatch namespace
	t.command("dispatch-namespace", "🏗️  Interact with a dispatch namespace");

	// wrangler mtls-certificate - Manage certificates used for mTLS connections
	t.command("mtls-certificate", "🪪 Manage certificates used for mTLS connections");

	// wrangler cert - Manage certificates used for mTLS and CA chain connections
	t.command("cert", "🪪 Manage certificates used for mTLS and Certificate Authority (CA) chain connections");
	t.command("cert upload", "Upload a certificate");
	t.command("cert upload mtls-certificate", "Upload an mTLS certificate");
	t.command("cert upload certificate-authority", "Upload a CA certificate");
	t.command("cert list", "List certificates");
	t.command("cert delete", "Delete a certificate");

	// wrangler secrets-store - Manage the Secrets Store
	t.command("secrets-store", "🔐 Manage the Secrets Store");
	t.command("secrets-store secret", "Manage account secrets within a secrets store");
	t.command("secrets-store store", "Manage your store within secrets store");

	// wrangler telemetry - Configure whether Wrangler can collect anonymous usage data
	t.command("telemetry", "Configure whether Wrangler can collect anonymous usage data");
	t.command("telemetry disable", "Disable telemetry collection");
	t.command("telemetry enable", "Enable telemetry collection");
	t.command("telemetry status", "Check telemetry collection status");

	// wrangler check - Validate your Worker
	t.command("check", "Validate your Worker");
	t.command("check startup", "Generate a CPU profile of your Worker's startup phase");

	// wrangler login/logout/whoami
	t.command("login", "🔓 Authorize Wrangler with your Cloudflare account using OAuth");
	t.command("logout", "🚪 Remove Wrangler's authorization for accessing your account");
	t.command("whoami", "🕵️  Retrieve your user information and test your authentication configuration");

	return t;
}

// Handle completion requests from the shell
export function handleCompletion(args: string[]) {
	const shell = args[0];

	if (shell === "--") {
		// Parse completion request from shell
		setupCompletions();
		t.parse(args.slice(1));
	} else {
		// Generate shell completion script
		setupCompletions();
		t.setup("wrangler", "wrangler", shell);
	}
}


