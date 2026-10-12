// Old Workers use positional inserts and singleton adoption state. They cannot run
// against migration 0005. Fail before migrations rather than break the live API.
export function checkStorageCutover(health, migrations, backend = 'd1') {
  if (backend === 'postgres') {
    if (health.storage_contract !== 'postgres-rls-v1')
      throw Error('PostgreSQL requires the verified maintenance cutover first. No automatic D1-to-Postgres switch is allowed.');
    return;
  }
  if (health.storage_contract === 'postgres-rls-v1') throw Error('Refusing automatic rollback from PostgreSQL to stale D1 data');
  if (Object.hasOwn(migrations, '0005_workspace_isolation.sql') && health.storage_contract !== 'workspace-v1')
    throw Error('Workspace isolation requires a coordinated maintenance cutover before automatic releases can resume. See docs/workspace-isolation-review.md. No migration has been applied by this run.');
}
