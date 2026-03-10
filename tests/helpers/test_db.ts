export function createTestDb() {
  return {
    path: ":memory:",
    close() {
      // no-op for now
    },
  };
}
