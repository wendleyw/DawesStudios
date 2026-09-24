/**
 * The badge tone vocabulary.
 *
 * `.status-badge` used to key its variant styling off four *project* enum values by name, which
 * meant every other domain that renders the badge — briefings, credit requests, team roles and
 * invitations — was silently flattened to one appearance. Adding a variant per enum value would
 * have grown the stylesheet every time a domain grew, and would have kept database enum values in
 * a stylesheet selector.
 *
 * Instead the badge styles four *meanings*, and each domain maps its own enum onto them beside its
 * label map (`statusLabels`, `briefingStatusLabels`, `creditRequestStatusLabels`). A new domain
 * gets its tones for free.
 *
 * Each tone pairs a shape cue with a restrained hue, so status never relies on color alone:
 *
 * | Tone         | Meaning                                                     | Shape                | Hue                         |
 * | ------------ | ------------------------------------------------------------ | --------------------- | ---------------------------- |
 * | `neutral`    | A resting state. Nobody is waiting and nothing is running.   | Filled dot            | Grey (the base surface)      |
 * | `active`     | Work is underway.                                            | Hollow ring           | Calm blue                    |
 * | `attention`  | The record is waiting on a person to act.                    | Dashed border         | Amber                        |
 * | `complete`   | The work finished and produced its result.                   | Solid fill, square dot | Green                        |
 */
export type StatusTone = "neutral" | "active" | "attention" | "complete";

/**
 * The class list for a badge in a given tone. `neutral` is the base appearance, so it adds no
 * modifier — a badge with no status at all (a role, an invitation) renders it by writing
 * `className="status-badge"` directly.
 */
export function statusToneClass(tone: StatusTone = "neutral"): string {
  return tone === "neutral" ? "status-badge" : `status-badge tone-${tone}`;
}
