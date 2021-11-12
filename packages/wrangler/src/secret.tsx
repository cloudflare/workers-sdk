import * as React from "react";
import { Box, Text, useInput } from "ink";

import TextInput from "ink-text-input";
import { useState } from "react";

export function GetSecretValue(props: { onSubmit: (value: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <Box>
      <Text>Enter a secret value: </Text>
      <Box>
        <TextInput
          mask="*"
          value={value}
          onChange={setValue}
          onSubmit={props.onSubmit}
        />
      </Box>
    </Box>
  );
}

export function DeleteConfirmation(props: { onConfirm: (boolean) => void }) {
  useInput((input: string) => {
    if (input === "y") {
      props.onConfirm(true);
    } else if (input === "n") {
      props.onConfirm(false);
    } else {
      console.log("Unrecognised input");
    }
  });
  return (
    <Box>
      <Text>Are you sure you want to delete this secret? (y/n) </Text>
    </Box>
  );
}
