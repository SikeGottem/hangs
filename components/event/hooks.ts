// Event page helpers: "others" counting that leaves out the viewer (real person or the 'local' overlay person).

// Excludes the viewer (real person or the 'local' overlay person) from "others" counts.
export function othersCount(ids: string[], viewerIds: ReadonlySet<string>): number {
  let n = 0
  for (const id of ids) if (!viewerIds.has(id)) n++
  return n
}
