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

  if (!notes.startsWith(SCHEDULE_PREFIX)) {
    return {
      schedule: DEFAULT_CONTACT_SCHEDULE,
      plainNotes: notes,
    };
  }

  const firstBreak = notes.indexOf('\n\n');
  const scheduleChunk = firstBreak === -1 ? notes.slice(SCHEDULE_PREFIX.length) : notes.slice(SCHEDULE_PREFIX.length, firstBreak);
  const plainNotes = firstBreak === -1 ? '' : notes.slice(firstBreak + 2);

  try {
    const parsed = JSON.parse(scheduleChunk) as ContactScheduleData;
    const milestones = DEFAULT_CONTACT_SCHEDULE.milestones.map((defaultMilestone) => {
      const existing = parsed?.milestones?.find((item) => item.id === defaultMilestone.id);
      return existing ? { ...defaultMilestone, ...existing } : defaultMilestone;
    });

    return {
      schedule: { milestones },
      plainNotes,
    };
  } catch {
    return {
      schedule: DEFAULT_CONTACT_SCHEDULE,
      plainNotes: notes,
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
