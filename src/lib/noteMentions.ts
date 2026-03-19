const MENTION_PREFIX = '[TRUSSCTR_MENTIONS]';

export type MentionTarget = {
  id: string;
  handle: string;
  name: string;
  email: string;
};

export type NoteMention = {
  id: string;
  handle: string;
  name: string;
};

function sanitizePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getTeamHandle(member: Pick<MentionTarget, 'name' | 'email'>) {
  const [firstName = '', lastName = ''] = member.name.trim().split(/\s+/);
  const initial = sanitizePart(firstName).slice(0, 1);
  const last = sanitizePart(lastName);

  if (initial && last) return `${initial}${last}`;

  const emailLocal = sanitizePart(member.email.split('@')[0] || '');
  if (emailLocal) return emailLocal;

  return sanitizePart(member.name) || 'team';
}

export function getMentionTargets(teamMembers: Array<{ id: string; name: string; email?: string | null }>): MentionTarget[] {
  return teamMembers
    .map((member) => ({
      id: member.id,
      handle: getTeamHandle({ name: member.name || 'Team Member', email: member.email || '' }),
      name: member.name || 'Team Member',
      email: member.email || '',
    }))
    .sort((left, right) => left.handle.localeCompare(right.handle));
}

export function extractMentionHandles(text: string) {
  const matches = text.match(/@([a-zA-Z0-9_]+)/g) || [];
  return Array.from(new Set(matches.map((match) => match.slice(1).toLowerCase())));
}

export function findActiveMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  if (caret < 0 || caret > text.length) return null;
  const before = text.slice(0, caret);
  const atIndex = before.lastIndexOf('@');
  if (atIndex === -1) return null;

  const between = before.slice(atIndex + 1);
  if (between.includes(' ') || between.includes('\n') || between.includes('\t')) return null;
  if (between.length > 32) return null;

  return { start: atIndex, query: between.toLowerCase() };
}

export function applyMention(text: string, start: number, caret: number, handle: string) {
  const prefix = text.slice(0, start);
  const suffix = text.slice(caret);
  const mention = `@${handle}`;
  const space = suffix.startsWith(' ') || suffix.length === 0 ? '' : ' ';
  const next = `${prefix}${mention}${space}${suffix}`;
  const nextCaret = (prefix + mention + space).length;
  return { text: next, caret: nextCaret };
}

export function getMentionSuggestions(targets: MentionTarget[], query: string) {
  const normalized = query.toLowerCase();
  return targets
    .filter((target) => {
      if (!normalized) return true;
      return (
        target.handle.includes(normalized) ||
        target.name.toLowerCase().includes(normalized) ||
        target.email.toLowerCase().includes(normalized)
      );
    })
    .slice(0, 6);
}

export function validateMentions(text: string, targets: MentionTarget[]) {
  const handles = extractMentionHandles(text);
  const known = new Set(targets.map((target) => target.handle.toLowerCase()));
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const handle of handles) {
    if (known.has(handle)) valid.push(handle);
    else invalid.push(handle);
  }

  return { valid, invalid };
}

export function serializeNoteMentions(content: string, mentions: NoteMention[]) {
  const plainContent = content.trim();
  if (!mentions.length) return plainContent;
  return `${plainContent}\n\n${MENTION_PREFIX}${JSON.stringify(mentions)}`;
}

export function parseNoteMentions(content?: string | null) {
  if (!content) {
    return {
      plainContent: '',
      mentions: [] as NoteMention[],
    };
  }

  const markerIndex = content.indexOf(`\n\n${MENTION_PREFIX}`);
  if (markerIndex === -1) {
    return {
      plainContent: content,
      mentions: [] as NoteMention[],
    };
  }

  const plainContent = content.slice(0, markerIndex);
  const mentionChunk = content.slice(markerIndex + 2 + MENTION_PREFIX.length);

  try {
    const mentions = JSON.parse(mentionChunk) as NoteMention[];
    return {
      plainContent,
      mentions: Array.isArray(mentions) ? mentions : [],
    };
  } catch {
    return {
      plainContent: content,
      mentions: [] as NoteMention[],
    };
  }
}
