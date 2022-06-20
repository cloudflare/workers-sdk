import { Text } from "ink";
import SelectInput from "ink-select-input";
import React, { useEffect, useRef, useState } from "react";
import { fetchListResult } from "../cfetch";
import { logger } from "../logger";
import { getCloudflareAccountIdFromEnv } from "./env-vars";

export type ChooseAccountItem = {
  id: string;
  name: string;
};

export function ChooseAccount(props: {
  isInteractive: boolean;
  onSelect: (accountId: string) => void;
  onError: (error: Error) => void;
}) {
  const [accounts, setAccounts] = useState<ChooseAccountItem[]>([]);
  const getAccountsPromiseRef =
    useRef<Promise<{ account: ChooseAccountItem }[]>>();

  useEffect(() => {
    async function selectAccount() {
      const accountIdFromEnv = getCloudflareAccountIdFromEnv();
      if (accountIdFromEnv) {
        props.onSelect(accountIdFromEnv);
      } else {
        getAccountsPromiseRef.current ??= fetchListResult<{
          account: ChooseAccountItem;
        }>(`/memberships`);
        const response = await getAccountsPromiseRef.current;
        if (response.length === 0) {
          props.onError(
            new Error(
              "Failed to automatically retrieve account IDs for the logged in user.\n" +
                "In a non-interactive environment, it is mandatory to specify an account ID, either by assigning its value to CLOUDFLARE_ACCOUNT_ID, or as `account_id` in your `wrangler.toml` file."
            )
          );
        } else if (response.length === 1) {
          props.onSelect(response[0].account.id);
        } else if (props.isInteractive) {
          setAccounts(response.map((x) => x.account));
        } else {
          props.onError(
            new Error(
              "More than one account available but unable to select one in non-interactive mode.\n" +
                `Please set the appropriate \`account_id\` in your \`wrangler.toml\` file.\n` +
                `Available accounts are ("<name>" - "<id>"):\n` +
                response
                  .map((x) => `  "${x.account.name}" - "${x.account.id}")`)
                  .join("\n")
            )
          );
        }
      }
    }
    selectAccount().catch((err) => props.onError(err));
  }, [props]);

  return accounts.length > 0 ? (
    <>
      <Text bold>Select an account from below:</Text>
      <SelectInput
        items={accounts.map((item) => ({
          key: item.id,
          label: item.name,
          value: item,
        }))}
        onSelect={(item) => {
          logger.log(`Using account: "${item.value.name} - ${item.value.id}"`);
          props.onSelect(item.value.id);
        }}
      />
    </>
  ) : null;
}
