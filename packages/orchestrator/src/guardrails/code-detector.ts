/**
 * Code-in-rationale detector.
 *
 * Guardrail: rationale must NEVER contain verbatim source code.
 * This is Layer 3 (code validation) — the strongest layer,
 * catching anything the prompt instruction (Layer 1) missed.
 */

const CODE_PATTERNS: RegExp[] = [
  /```[\s\S]*?```/,                         // fenced code blocks
  /^\s{4,}\S/m,                              // indented code (4+ spaces at line start)
  /(?:import|export|from)\s+['"@{]/,        // import/export statements
  /(?:const|let|var|function|class)\s+\w+/,  // declarations
  /=>\s*[{(]/,                               // arrow functions
  /\b\w+\.\w+\([^)]*\)/,                    // method calls like obj.method()
  /[{};]\s*$/m,                              // lines ending with { } ;
  /(?:async|await)\s+\w/,                    // async/await keywords
  /(?:if|else|for|while|switch)\s*\(/,       // control flow with parens
  /(?:return|throw|new)\s+\w/,              // return/throw/new statements
];

/**
 * Returns true if the text likely contains source code.
 */
export function containsCode(text: string): boolean {
  // Count how many patterns match — a single match could be a false positive
  // (e.g. "the function handles..." triggers the word "function")
  // Require at least 2 pattern matches to flag as code
  let matchCount = 0;
  for (const pattern of CODE_PATTERNS) {
    if (pattern.test(text)) {
      matchCount++;
      if (matchCount >= 2) return true;
    }
  }
  return false;
}
