export type Row = Record<string, unknown>;

export interface QueryError {
  code?: string;
  message?: string;
  status?: number;
}

export interface QueryResult {
  data: Row[] | null;
  error?: QueryError | null;
}

export interface DbQuery extends PromiseLike<QueryResult> {
  select(columns: string): DbQuery;
  eq(column: string, value: unknown): DbQuery;
  order(column: string, options?: { ascending?: boolean }): DbQuery;
  limit(value: number): DbQuery;
  insert(row: Row | Row[]): DbQuery;
  insertIfAbsent(row: Row, options: { onConflict: string }): DbQuery;
  update(patch: Row): DbQuery;
  delete(): DbQuery;
}

export interface DbPort {
  from(table: string): DbQuery;
}

export interface PlatformIdentity {
  qoderUserId: string;
  displayName: string;
}

export interface AppDeps {
  db: DbPort;
  identity: PlatformIdentity | null;
  now: () => Date;
  newId: () => string;
}
