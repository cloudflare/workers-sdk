import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const diff = execSync(`git diff HEAD~1 packages/create-cloudflare/src/frameworks/package.json`).toString();

const changedPackages = diff.match(/-\s*".*":\s".*",?/g)?.map(
    match => match.match(/-\s*"(.*)":/)?.[1]
).filter(Boolean) ?? [];

const changes = changedPackages.map(pkg => {
    const getPackageChangeRegex = (addition) =>
        new RegExp(`${ addition ? '\\+' : '-' }\\s*"${pkg}":\\s"(.*)",?`);

    const from = diff.match(getPackageChangeRegex(false))?.[1];
    const to = diff.match(getPackageChangeRegex(true))?.[1];

    if(!from || !to) {
        throw new Error(`Unexpected changes for package ${pkg} (could not determine upgrade)`);
    }

    return {
        package: pkg,
        from,
        to,
    }
});

if(!changes.length) {
    console.warn('No changes detected!');
} else {

    writeFileSync(`.changeset/changeset-${Math.round(Math.random() * 100000)}.md`,
`---
"dependabot-testing": patch
---

Updated dependencies
${
    changes.map(({package: pkg, from, to}) =>
        ` - \`${pkg}\` from \`${from}\` to \`${to}\``
    ).join('\n')
}

`);

execSync("git add .changeset");
execSync("git commit --amend -m '[C3] Update frameworks cli dependencies'");
execSync("git push -f");

}
