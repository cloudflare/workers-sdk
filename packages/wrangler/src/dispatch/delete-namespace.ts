import { fetchResult } from "../cfetch";
import { logger } from "../logger";

import { namespacePath } from ".";

type Props = {
    accountId: string

    namespaceName: string
}

export default async function deleteNamespace(props: Props): Promise<void> {
    await fetchResult(
        namespacePath(props.accountId, props.namespaceName),
        {
            method: "DELETE",
        }
    )

    logger.log(`Deleted namespace ${props.namespaceName}.`)
}