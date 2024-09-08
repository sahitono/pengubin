export function takeFirst<T>(rows: T[]): T | undefined {
  if (rows.length === 0) {
    return
  }

  return rows[0]
}
