export const hyperdriveBetaWarning =
	"--------------------\n📣 Hyperdrive is currently in open beta\n📣 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose\n📣 To give feedback, visit https://discord.gg/cloudflaredev\n--------------------\n";

export function parseConnectionString(connectionString: string) {
	const pattern =
		/^(?:(?<protocol>[^:/?#\s]+):\/{2})?(?:(?<user>[^@/?#\s]+):(?<password>[^@/?#\s]+)@)?(?<host>[^/?#\s]+):(?<port>\d+)(?:\/(?<database>[^?#\s]*))?(?:[?](?<params>[^#\s]+))?\S*$/gm;
	const match = pattern.exec(connectionString);

	if (match) {
		return {
			user: match.groups?.user ?? "",
			password: match.groups?.password ?? "",
			host: match.groups?.host ?? "",
			port: parseInt(match.groups?.port ?? ""),
			database: match.groups?.database ?? "",
		};
	} else {
		return null;
	}
}
