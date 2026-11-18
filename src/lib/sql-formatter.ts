import type { DbKind } from "../types/database";

const MAJOR_CLAUSES = [
  "SELECT",
  "FROM",
  "WHERE",
  "GROUP BY",
  "HAVING",
  "ORDER BY",
  "LIMIT",
  "OFFSET",
  "LEFT OUTER JOIN",
  "RIGHT OUTER JOIN",
  "FULL OUTER JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "INNER JOIN",
  "CROSS JOIN",
  "JOIN",
  "UNION ALL",
  "UNION",
  "INSERT INTO",
  "VALUES",
  "UPDATE",
  "SET",
  "DELETE FROM",
  "RETURNING",
];

const SQL_KEYWORDS = new Set([
  "SELECT",
  "DISTINCT",
  "FROM",
  "WHERE",
  "AND",
  "OR",
  "NOT",
  "IN",
  "IS",
  "NULL",
  "LIKE",
  "ILIKE",
  "AS",
  "ON",
  "USING",
  "JOIN",
  "LEFT",
  "RIGHT",
  "INNER",
  "OUTER",
  "CROSS",
  "FULL",
  "GROUP",
  "BY",
  "HAVING",
  "ORDER",
  "ASC",
  "DESC",
  "LIMIT",
  "OFFSET",
  "INSERT",
  "INTO",
  "VALUES",
  "UPDATE",
  "SET",
  "DELETE",
  "CREATE",
  "ALTER",
  "DROP",
  "TRUNCATE",
  "TABLE",
  "VIEW",
  "INDEX",
  "PRIMARY",
  "KEY",
  "FOREIGN",
  "REFERENCES",
  "CONSTRAINT",
  "DEFAULT",
  "AUTO_INCREMENT",
  "SERIAL",
  "BIGSERIAL",
  "RETURNING",
  "UNION",
  "ALL",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "EXISTS",
  "BETWEEN",
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "COALESCE",
  "EXPLAIN",
  "ANALYZE",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
]);

interface StatementSpan {
  start: number;
  end: number;
  text: string;
}

export function splitSqlWithSpans(sql: string): StatementSpan[] {
  const spans: StatementSpan[] = [];
  let start = 0;
  let i = 0;
  const len = sql.length;

  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  while (i < len) {
    const ch = sql[i];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && sql[i + 1] === "/") {
        inBlockComment = false;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    if (dollarTag) {
      if (ch === "$" && sql.startsWith(dollarTag, i)) {
        i += dollarTag.length;
        dollarTag = null;
      } else {
        i += 1;
      }
      continue;
    }
    if (inSingle) {
      if (ch === "\\" && i + 1 < len) {
        i += 2;
        continue;
      }
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        inSingle = false;
      }
      i += 1;
      continue;
    }
    if (inDouble) {
      if (ch === "\\" && i + 1 < len) {
        i += 2;
        continue;
      }
      if (ch === '"') {
        if (sql[i + 1] === '"') {
          i += 2;
          continue;
        }
        inDouble = false;
      }
      i += 1;
      continue;
    }
    if (inBacktick) {
      if (ch === "`") {
        if (sql[i + 1] === "`") {
          i += 2;
          continue;
        }
        inBacktick = false;
      }
      i += 1;
      continue;
    }

    if (ch === "-" && sql[i + 1] === "-") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === "#") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i += 1;
      continue;
    }
    if (ch === "`") {
      inBacktick = true;
      i += 1;
      continue;
    }
    if (ch === "$") {
      const m = sql.slice(i).match(/^\$(?:[A-Za-z0-9_]*)\$/);
      if (m) {
        dollarTag = m[0];
        i += dollarTag.length;
        continue;
      }
    }
    if (ch === ";") {
      const chunk = sql.slice(start, i).trim();
      if (chunk) {
        spans.push({ start, end: i, text: chunk });
      }
      start = i + 1;
    }
    i += 1;
  }

  const tail = sql.slice(start).trim();
  if (tail) {
    spans.push({ start, end: len, text: tail });
  }
  return spans;
}

export function extractStatementAtOffset(sql: string, offset: number): string {
  const spans = splitSqlWithSpans(sql);
  if (spans.length === 0) return "";
  const hit = spans.find((s) => offset >= s.start && offset <= s.end + 1);
  if (hit) return hit.text;
  const preceding = [...spans].reverse().find((s) => s.end < offset);
  return (preceding ?? spans[0]).text;
}

function formatSingleStatement(stmt: string, _kind: DbKind): string {
  // Tokenize preserving strings, quoted identifiers, and comments
  const tokenRegex =
    /('(?:\\.|''|[^'])*'|"(?:\\.|""|[^"])*"|`(?:``|[^`])*`|--[^\n]*|\/\*[\s\S]*?\*\/|\s+|[(),;.]|[^\s(),;.']+)/g;
  const rawTokens = stmt.match(tokenRegex) ?? [stmt];

  const normalized: string[] = [];
  for (const tok of rawTokens) {
    if (/^\s+$/.test(tok)) {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== " ") {
        normalized.push(" ");
      }
      continue;
    }
    const upper = tok.toUpperCase();
    if (
      !tok.startsWith("'") &&
      !tok.startsWith('"') &&
      !tok.startsWith("`") &&
      !tok.startsWith("--") &&
      !tok.startsWith("/*") &&
      SQL_KEYWORDS.has(upper)
    ) {
      normalized.push(upper);
    } else {
      normalized.push(tok);
    }
  }

  let joined = normalized
    .join("")
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();

  // Insert clean line breaks before major SQL clauses outside quotes
  for (const clause of MAJOR_CLAUSES) {
    const escaped = clause.replace(/\s+/g, "\\s+");
    const re = new RegExp(`(?<!^)\\s+(${escaped})\\b`, "g");
    joined = joined.replace(re, `\n$1`);
  }
  joined = joined.replace(/\s+\b(AND|OR)\b/g, "\n  $1");
  return joined.trim();
}

export function formatSql(sql: string, kind: DbKind): string {
  const spans = splitSqlWithSpans(sql);
  if (spans.length === 0) return sql;
  return spans.map((s) => `${formatSingleStatement(s.text, kind)};`).join("\n\n");
}

export function buildExplainSql(statement: string, kind: DbKind): string {
  const trimmed = statement.trim().replace(/;+$/, "");
  if (!trimmed) return "";
  if (/^EXPLAIN\b/i.test(trimmed)) return trimmed;
  return kind === "postgres"
    ? `EXPLAIN (ANALYZE false, COSTS true) ${trimmed}`
    : `EXPLAIN ${trimmed}`;
}
