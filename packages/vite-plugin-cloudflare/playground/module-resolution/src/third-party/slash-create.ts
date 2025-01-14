// Note: we can import from the /web entrypoint, if we import from the default one things don't work
//       both because of missing built-in node modules and also because of other module resolution
//       issues.
//       Note that in the readme itself: https://github.com/Snazzah/slash-create?tab=readme-ov-file#using-webservers
//       they say to use /web, so I do think that this is good enough (should the standard import also work?)
import { Collection, SlashCreator, VERSION } from "slash-create/web";

const slashCreatorInstance = new SlashCreator({
	applicationID: "xxx",
});

const myCollection = new Collection([["a number", 54321]]);

// The slash-create package `require`s its package.json for its version
// (source: https://github.com/Snazzah/slash-create/blob/a08e8f35bc/src/constants.ts#L13)
// we need to make sure that we do support this
export default {
	"(slash-create/web) VERSION": VERSION,
	"(slash-create/web) slashCreatorInstance is instance of SlashCreator":
		slashCreatorInstance instanceof SlashCreator,
	"(slash-create/web) myCollection.random()": myCollection.random(),
};
