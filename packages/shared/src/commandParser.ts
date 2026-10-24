/**
 * Deterministic manager command parser.
 *   assign <employee> | <project> | <task> | due <date>
 *   /assign <employee> | <project> | <task> | due <date>
 * The "due" segment is optional. No fuzzy matching, no AI.
 */
export interface ParsedAssignmentCommand {
  kind: "ASSIGN";
  employee: string;
  project: string;
  title: string;
  due: string | null;
  raw: string;
}

export interface AssignmentParseContext {
  timeZone: string;
  now?: Date;
}

export interface AssignmentCommandParser {
  parse(text: string, context: AssignmentParseContext): Promise<ParsedAssignmentCommand | null>;
}

export function isAssignCommand(text: string): boolean {
  return /^\/?assign\b/i.test((text || "").trim());
}

export function parseAssignCommandSync(text: string): ParsedAssignmentCommand | { error: string } | null {
  const raw = (text || "").trim();
  const m = /^\/?assign(?:@\w+)?\s+(.*)$/is.exec(raw);
  if (!m) return null;
  const segments = m[1].split("|").map((s) => s.trim());
  if (segments.length < 3) {
    return { error: "Format: assign <employee> | <project> | <task> | due <date>" };
  }
  const [employee, project, title, ...rest] = segments;
  if (!employee || !project || !title) {
    return { error: "Employee, project and task are all required.\nFormat: assign <employee> | <project> | <task> | due <date>" };
  }
  let due: string | null = null;
  if (rest.length > 0) {
    const dueSeg = rest.join(" | ").trim();
    due = dueSeg.replace(/^due\s*:?\s*/i, "").trim() || null;
  }
  return { kind: "ASSIGN", employee, project, title, due, raw };
}

export class DeterministicAssignmentCommandParser implements AssignmentCommandParser {
  async parse(text: string): Promise<ParsedAssignmentCommand | null> {
    const r = parseAssignCommandSync(text);
    if (!r || "error" in r) return null;
    return r;
  }
}
