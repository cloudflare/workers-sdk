export const KEY_PREFIX = "prerelease";
export const KEY_SEPARATOR = ":";

export const generateListKey = ({ tag }: { tag: string }) =>
  [KEY_PREFIX, "tag", tag].join(KEY_SEPARATOR);

export const generateAliasKey = ({
  tag,
  packageName,
}: {
  tag: string;
  packageName: string;
}) => [KEY_PREFIX, "tag", tag, "package", packageName].join(KEY_SEPARATOR);

export const generateKey = ({
  tag,
  version,
  packageName,
}: {
  tag: string;
  version: string;
  packageName: string;
}) =>
  [KEY_PREFIX, "tag", tag, "package", packageName, "version", version].join(
    KEY_SEPARATOR
  );
