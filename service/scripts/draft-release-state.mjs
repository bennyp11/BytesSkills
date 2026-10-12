// Drafts are discoverable through authenticated listing, not published-by-tag lookup.
export function findRelease(pages, tag) {
  const matches = pages.flat().filter(release => release.tag_name === tag);
  if (matches.length > 1) throw Error('Multiple releases use this tag; resolve explicitly');
  return matches[0];
}
export function verifyDraftTarget(release, commit, taggedCommit) {
  if (!release.draft) throw Error('Release already published; bump release.json for new work');
  // GitHub may defer creating a draft's tag until publication.
  if ((taggedCommit ?? release.target_commitish) !== commit)
    throw Error('Version already belongs to a different commit; bump release.json');
}
