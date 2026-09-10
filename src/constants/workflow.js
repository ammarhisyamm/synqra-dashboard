import { Check, CheckCircle as CheckCircle2, Circle as CircleDot, ClipboardText as ClipboardList, Flag, ListChecks, ChatCircle as MessageCircle, CursorClick as MousePointer2, Target } from '@phosphor-icons/react';

export const STORAGE_KEY = 'synqra-dashboard-v1';
export const AREAS = ['Design', 'Engineering', 'Marketing'];
export const STAGES = ['Planning', 'Review', 'In Progress', 'Final', 'Completed'];
export const PRIORITIES = ['Blocker', 'Major', 'Minor'];
export const STATUS_OPTIONS = ['Open', 'In Progress', 'Review', 'Resolved', 'Rejected'];
export const STAGE_ICONS = [ClipboardList, CircleDot, Target, CheckCircle2, Check];
export const STAGE_META = [
  { name: 'Planning', Icon: ListChecks, color: '#718199' },
  { name: 'Review', Icon: MessageCircle, color: '#526784' },
  { name: 'In Progress', Icon: MousePointer2, color: '#33445e' },
  { name: 'Final', Icon: Flag, color: '#111b30' },
  { name: 'Completed', Icon: CheckCircle2, color: '#248764' }
];
export const PROJECTS = ['Omnichannel', 'Kaizen Project', 'Billing Portal', 'Onboarding Revamp', 'Test ER'];
