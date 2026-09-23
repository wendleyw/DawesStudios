type DatedProject = { start_date: string | null; due_date: string | null };

/** A project spanning two quarters belongs in both; undated work remains discoverable. */
export function projectInPeriod(project: DatedProject, period: string): boolean {
  if (!period || (!project.start_date && !project.due_date)) return true;
  const start = periodStart(period);
  if (!start) return true;
  const end = new Date(`${start}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 3);
  const projectStart = project.start_date ?? project.due_date!;
  const projectEnd = project.due_date ?? project.start_date!;
  return projectStart < end.toISOString().slice(0, 10) && projectEnd >= start;
}

export function periodStart(period: string): string | null {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  return match ? `${match[1]}-${String((Number(match[2]) - 1) * 3 + 1).padStart(2, "0")}-01` : null;
}
