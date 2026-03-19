import { parseContactSchedule } from './contactSchedule';

export type PipelineEvent = {
  id: string;
  contactId: string;
  contactName: string;
  title: string;
  type: 'inspection' | 'build' | 'cleanup' | 'pick_up_check' | 'coc';
  date: string;
  location: string;
  crew: string | null;
  source: 'schedule' | 'work_order';
};

const EVENT_LABELS: Record<PipelineEvent['type'], string> = {
  inspection: 'Inspection',
  build: 'Build',
  cleanup: 'Clean Up',
  pick_up_check: 'Pick Up Check',
  coc: 'COC',
};

function buildLocation(contact: any) {
  return [contact?.address, contact?.city, contact?.state, contact?.zip].filter(Boolean).join(', ');
}

export function buildContactPipelineEvents(contact: any, workOrders: any[] = []) {
  const parsed = parseContactSchedule(contact?.notes);
  const contactName = `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || 'Customer';
  const location = buildLocation(contact);
  const events: PipelineEvent[] = [];

  for (const milestone of parsed.schedule.milestones) {
    if (!milestone.date) continue;
    events.push({
      id: `${contact?.id}-${milestone.id}`,
      contactId: contact?.id,
      contactName,
      title: EVENT_LABELS[milestone.id],
      type: milestone.id,
      date: milestone.date,
      location,
      crew: null,
      source: 'schedule',
    });
  }

  for (const order of workOrders) {
    if (!order?.scheduled_date) continue;
    events.push({
      id: order.id,
      contactId: contact?.id,
      contactName,
      title: order.title || EVENT_LABELS.build,
      type: 'build',
      date: order.scheduled_date,
      location,
      crew: order.assigned_to || null,
      source: 'work_order',
    });
  }

  const deduped = new Map<string, PipelineEvent>();
  for (const event of events) {
    const key = event.source === 'work_order' ? `wo-${event.id}` : `${event.type}-${event.date}`;
    if (!deduped.has(key)) {
      deduped.set(key, event);
    }
  }

  return Array.from(deduped.values()).sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}

export function getUpcomingPipelineEvents(events: PipelineEvent[], now = new Date()) {
  return events.filter((event) => new Date(event.date).getTime() >= now.getTime());
}
