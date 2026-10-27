import type { Task, TaskLink } from "./model.js";

export type TaskView = "inbox" | "today" | "upcoming" | "flagged" | "all";

export function parseTags(value: string): string[] {
  const tags: string[] = [];
  for (const part of value.split(",")) {
    const tag = part.trim();
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function isOpen(task: Task): boolean {
  return task.completedAt === null;
}

export function taskMatches(task: Task, view: TaskView, today: string): boolean {
  if (view === "all") return true;
  if (!isOpen(task)) return false;
  if (view === "flagged") return task.flagged;
  if (view === "inbox") return task.due === null;
  if (view === "today") return task.due !== null && task.due <= today;
  return task.due !== null && task.due > today;
}

/**
 * Today includes overdue dates, matching the Apple Reminders Today smart list.
 * Upcoming is only later dates. Apple's Scheduled list also includes today;
 * this view does not, so a dated task is in one list.
 * Completing a parent does not complete subtasks.
 */
export function visibleTasks(tasks: readonly Task[], view: TaskView, today: string): Task[] {
  const included = new Set<string>();
  for (const task of tasks) {
    if (taskMatches(task, view, today)) included.add(task.id);
  }
  for (const task of tasks) {
    if (task.parentId && included.has(task.parentId) && (view === "all" || isOpen(task))) {
      included.add(task.id);
    }
  }
  return tasks.filter((task) => included.has(task.id));
}

export function linkLabel(link: TaskLink, revisionLabel: string): string {
  return `Rev ${revisionLabel} · page ${link.pageIndex + 1}`;
}
