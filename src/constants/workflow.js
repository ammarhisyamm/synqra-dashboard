import { Check, CheckCircle as CheckCircle2, Circle as CircleDot, ClipboardText as ClipboardList, Flag, ListChecks, ChatCircle as MessageCircle, CursorClick as MousePointer2, Target } from '@phosphor-icons/react';

export const STORAGE_KEY = 'synqra-dashboard-v1';
export const AREAS = ['Design', 'Engineering', 'Marketing'];
export const STAGES = ['Planning', 'Review', 'In Progress', 'Final', 'Completed'];
export const PRIORITIES = ['Blocker', 'Major', 'Minor'];
export const STATUS_OPTIONS = ['Open', 'In Progress', 'Review', 'Resolved', 'Rejected'];
export const STAGE_ICONS = [ClipboardList, CircleDot, Target, CheckCircle2, Check];
export const STAGE_META = [
  { name: 'Planning', Icon: ListChecks, color: '#8b5cf6' },
  { name: 'Review', Icon: MessageCircle, color: '#3b82f6' },
  { name: 'In Progress', Icon: MousePointer2, color: '#a855f7' },
  { name: 'Final', Icon: Flag, color: '#3b82f6' },
  { name: 'Completed', Icon: CheckCircle2, color: '#22c55e' }
];
export const PROJECTS = ['Omnichannel', 'Kaizen Project', 'Billing Portal', 'Onboarding Revamp', 'Test ER'];
