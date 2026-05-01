// Minimal expo-sqlite stub for test environments (no native SQLite runtime).
const mockDb = {
  execAsync:     async () => {},
  runAsync:      async () => ({ changes: 0, lastInsertRowId: 0 }),
  getFirstAsync:  async () => null,
  getAllAsync:    async () => [],
  closeAsync:    async () => {},
};
export const openDatabaseAsync = async () => mockDb;
export const SQLiteDatabase = class {};
export default { openDatabaseAsync };
