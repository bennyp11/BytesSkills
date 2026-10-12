// Old Workers use positional inserts and singleton adoption state. They cannot run
// against migration 0005. Fail before migrations rather than break the live API.
export function checkStorageCutover(health, migrations) {
  if (Object.hasOwn(migrations, '0005_workspace_isolation.sql') && health.storage_contract !== 'workspace-v1')
    throw Error('Workspace isolation requires a coordinated maintenance cutover before automatic releases can resume. See docs/workspace-isolation-review.md. No migration has been applied by this run.');
}
