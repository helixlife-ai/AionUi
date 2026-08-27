export function withSavepoint(db, operation) {
  db.exec('SAVEPOINT studio_import_session');
  try {
    const result = operation();
    db.exec('RELEASE SAVEPOINT studio_import_session');
    return result;
  } catch (error) {
    db.exec('ROLLBACK TO SAVEPOINT studio_import_session');
    db.exec('RELEASE SAVEPOINT studio_import_session');
    throw error;
  }
}

export function loadImportedSessionIds(db) {
  return new Set(
    db
      .prepare(
        `SELECT json_extract(extra, '$.originalSessionId') AS sid FROM conversations WHERE json_extract(extra, '$.source') = 'studio-import'`
      )
      .all()
      .map((row) => row.sid)
      .filter((sessionId) => typeof sessionId === 'string' && sessionId.length > 0)
  );
}
