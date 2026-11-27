/** Keep all recovery checkpoints before archival without serial network latency. */
export async function prepareMenuDeletion(menuIds: readonly string[], checkpoint: (id: string) => Promise<unknown>) {
  let cursor = 0;
  let failed = false;
  let failure: unknown;
  await Promise.all(Array.from({ length: Math.min(3, menuIds.length) }, async () => {
    while (!failed && cursor < menuIds.length) {
      const id = menuIds[cursor++];
      try { await checkpoint(id); }
      catch (error) { failed = true; failure = error; }
    }
  }));
  if (failed) throw failure;
}
