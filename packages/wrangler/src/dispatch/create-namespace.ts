import { fetchResult } from "../cfetch";
import { logger } from "../logger";

import { namespacesPath } from "./dispatch";
import type { Namespace } from "./dispatch";

interface Props {
    accountId: string

    namespaceName: string
}

type CreateNamespaceRequest = {
    name: string
}

export default async function createNamespace(props: Props): Promise<void> {
    const body: CreateNamespaceRequest = {name: props.namespaceName}
    const namespace = await fetchResult<Namespace>(
        namespacesPath(props.accountId),
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        },
    )

    logger.log(`Created namespace ${props.namespaceName} with ID ${namespace.namespace_id}`)
}
