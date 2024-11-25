import { defineNamespace } from "../core";
import { defineVersionsDeploy } from "./deploy";
import { defineVersionsList } from "./list";
import { defineVersionsSecret } from "./secrets";
import { defineVersionsSecretBulk } from "./secrets/bulk";
import { defineVersionsSecretDelete } from "./secrets/delete";
import { defineVersionsSecretList } from "./secrets/list";
import { defineVersionsSecretPut } from "./secrets/put";
import { defineVersionsUpload } from "./upload";
import { defineVersionsView } from "./view";

defineNamespace({
	command: "wrangler versions",
	metadata: {
		description:
			"🫧  List, view, upload and deploy Versions of your Worker to Cloudflare",
		status: "stable",
		owner: "Workers: Authoring and Testing",
	},
});

defineVersionsView();
defineVersionsList();
defineVersionsUpload();
defineVersionsDeploy();
defineVersionsSecret();
defineVersionsSecretList();
defineVersionsSecretPut();
defineVersionsSecretDelete();
defineVersionsSecretBulk();
