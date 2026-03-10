export async function createTestDb() {
  return {
    path: ":memory:",
    async close() {
      // no-op for now
    },
  };
}
