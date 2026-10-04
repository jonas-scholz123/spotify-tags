export interface Tag {
  id: string
  name: string
  /** Track keys in playlist order. */
  trackKeys: ReadonlySet<string>
}

/**
 * Track keys that are in every selected tag, in the order of the first selected tag.
 * With no tag selected the result is empty.
 */
export function matchTracks(tags: readonly Tag[], selected: ReadonlySet<string>): string[] {
  const [first, ...rest] = tags.filter((t) => selected.has(t.id))
  if (!first) return []
  return [...first.trackKeys].filter((key) => rest.every((t) => t.trackKeys.has(key)))
}

/** For each tag, how many tracks would match if that tag were added to the selection. */
export function facetCounts(
  tags: readonly Tag[],
  selected: ReadonlySet<string>,
): Map<string, number> {
  return new Map(
    tags.map((tag) => [tag.id, matchTracks(tags, new Set(selected).add(tag.id)).length]),
  )
}

/** Human-readable form of the selection, e.g. "chill + vocal". */
export function describeSelection(tags: readonly Tag[], selected: ReadonlySet<string>): string {
  return tags
    .filter((t) => selected.has(t.id))
    .map((t) => t.name)
    .join(' + ')
}
