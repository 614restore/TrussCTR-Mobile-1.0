export type ContactMilestoneId =
  | 'inspection'
  | 'build'
  | 'cleanup'
  | 'pick_up_check'
  | 'coc';

export type ContactMilestone = {
  id: ContactMilestoneId;
  label: string;
  date: string | null;
  completedAt: string | null;
};

export type ContactScheduleData = {
  milestones: ContactMilestone[];
};

const SCHEDULE_PREFIX = '[TRUSSCTR_SCHEDULE]';

function extractScheduleChunk(notes: string) {
  const prefixIndex = notes.indexOf(SCHEDULE_PREFIX);
  if (prefixIndex === -1) return null;

  const start = prefixIndex + SCHEDULE_PREFIX.length;
  const firstBreak = notes.indexOf('\n\n', start);
  const scheduleChunk = firstBreak === -1 ? notes.slice(start) : notes.slice(start, firstBreak);
  const plainNotes = firstBreak === -1 ? notes.slice(0, prefixIndex).trim() : `${notes.slice(0, prefixIndex)}${notes.slice(firstBreak + 2)}`.trim();

  return {
    scheduleChunk,
    plainNotes,
  };
}

export const DEFAULT_CONTACT_SCHEDULE: ContactScheduleData = {
  milestones: [
    { id: 'inspection', label: 'Inspection', date: null, completedAt: null },
    { id: 'build', label: 'Build', date: null, completedAt: null },
    { id: 'cleanup', label: 'Clean Up', date: null, completedAt: null },
    { id: 'pick_up_check', label: 'Pick Up Check', date: null, completedAt: null },
    { id: 'coc', label: 'COC', date: null, completedAt: null },
  ],
};

export function parseContactSchedule(notes?: string | null) {
  if (!notes) {
    return {
      schedule: DEFAULT_CONTACT_SCHEDULE,
      plainNotes: '',
    };
  }

  const extracted = extractScheduleChunk(notes);

  if (!extracted) {
    return {
      schedule: DEFAULT_CONTACT_SCHEDULE,
      plainNotes: notes,
    };
  }

  try {
    const parsed = JSON.parse(extracted.scheduleChunk) as ContactScheduleData;
    const milestones = DEFAULT_CONTACT_SCHEDULE.milestones.map((defaultMilestone) => {
      const existing = parsed?.milestones?.find((item) => item.id === defaultMilestone.id);
      return existing ? { ...defaultMilestone, ...existing } : defaultMilestone;
    });

    // Recursively strip nested schedule markers that may have been double-serialized
    let cleanPlainNotes = extracted.plainNotes;
    while (cleanPlainNotes.includes(SCHEDULE_PREFIX)) {
      const inner = extractScheduleChunk(cleanPlainNotes);
      if (!inner) {
        cleanPlainNotes = cleanPlainNotes.replace(/\[TRUSSCTR_SCHEDULE\]\{[\s\S]*$/, '').trim();
        break;
      }
      cleanPlainNotes = inner.plainNotes;
    }

    return {
      schedule: { milestones },
      plainNotes: cleanPlainNotes,
    };
  } catch {
    let cleanPlainNotes = extracted.plainNotes || notes.replace(SCHEDULE_PREFIX, '').trim();
    while (cleanPlainNotes.includes(SCHEDULE_PREFIX)) {
      const inner = extractScheduleChunk(cleanPlainNotes);
      if (!inner) {
        cleanPlainNotes = cleanPlainNotes.replace(/\[TRUSSCTR_SCHEDULE\]\{[\s\S]*$/, '').trim();
        break;
      }
      cleanPlainNotes = inner.plainNotes;
    }
    return {
      schedule: DEFAULT_CONTACT_SCHEDULE,
      plainNotes: cleanPlainNotes,
    };
  }
}

export function serializeContactSchedule(schedule: ContactScheduleData, plainNotes: string) {
  return `${SCHEDULE_PREFIX}${JSON.stringify(schedule)}\n\n${plainNotes.trim()}`;
}

export function updateScheduleMilestone(
  schedule: ContactScheduleData,
  milestoneId: ContactMilestoneId,
  patch: Partial<ContactMilestone>
) {
  return {
    milestones: schedule.milestones.map((milestone) =>
      milestone.id === milestoneId ? { ...milestone, ...patch } : milestone
    ),
  };
}
