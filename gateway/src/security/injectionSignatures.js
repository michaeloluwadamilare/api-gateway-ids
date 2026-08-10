// Curated, OWASP-CRS-inspired signature set for R1 (Table 2). Not the full
// CRS ruleset - a focused subset covering the classic SQL/NoSQL injection
// shapes used by the attack simulation tooling (Table 4: Burp Suite payloads).
const SIGNATURES = [
  { id: 'sql-union-select', regex: /\bunion\b[\s\S]{0,40}\bselect\b/i },
  { id: 'sql-tautology', regex: /\bor\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i },
  { id: 'sql-comment-terminator', regex: /(--|#|\/\*)\s*$/ },
  { id: 'sql-stacked-query', regex: /;\s*(drop|delete|insert|update)\b/i },
  { id: 'sql-drop-table', regex: /\bdrop\b\s+\btable\b/i },
  { id: 'sql-exec', regex: /\bexec(\s|\()+\s*\(/i },
  { id: 'nosql-operator', regex: /\$(where|ne|gt|gte|lt|lte|regex|exists)\b/i },
];

function matchInjectionSignature(text) {
  for (const signature of SIGNATURES) {
    if (signature.regex.test(text)) {
      return signature.id;
    }
  }
  return null;
}

module.exports = { matchInjectionSignature };
