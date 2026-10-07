/**
 * Class-name joiner. Falsy values drop out, so a conditional class can be
 * written inline without a ternary that has to produce `""`.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
