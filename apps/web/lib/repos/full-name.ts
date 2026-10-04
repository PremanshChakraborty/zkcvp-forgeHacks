// apps/web/lib/repos/full-name.ts

/**
 * `full_name` is `owner/name`, but `RepoRef` wants the two parts separately so
 * it can dim the owner segment.
 *
 * Split on the FIRST slash only: a repo name never contains one and an owner
 * name never does either, so the first slash is the only separator and any
 * later one would belong to the name.
 *
 * This was copied into three page files before it earned a module. It lives
 * under `lib/repos` rather than a `lib/format` grab bag because it knows one
 * specific thing about `project_repos.full_name`, which is the same reason it
 * must not grow a second responsibility.
 */
export function splitFullName(fullName: string): { owner: string; name: string } {
  const i = fullName.indexOf("/");
  return i === -1
    ? { owner: "", name: fullName }
    : { owner: fullName.slice(0, i), name: fullName.slice(i + 1) };
}
