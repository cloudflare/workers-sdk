import { createNamespace } from "../core/create-command";
import { aiModelsCommand } from "./listCatalog";
import { aiFineTuneListCommand } from "./listFinetune";
import { aiFineTuneCreateCommand } from "./createFinetune";

export const aiNamespace = createNamespace({
  metadata: {
    description: "🤖 Interact with AI models",
    status: "stable",
    owner: "Product: AI",
  },
});

export const aiFineTuneNamespace = createNamespace({
  metadata: {
    description: "Interact with finetune files",
    status: "stable",
    owner: "Product: AI",
  },
});

// Export commands
export { aiModelsCommand };
export { aiFineTuneListCommand, aiFineTuneCreateCommand };
