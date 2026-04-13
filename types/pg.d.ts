declare module "pg" {
  export interface QueryResultRow {
    [column: string]: any
  }

  export interface QueryResult<R extends QueryResultRow = QueryResultRow> {
    rows: R[]
    rowCount: number | null
  }

  export interface PoolClient {
    query<R extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<R>>
    release(): void
  }

  export interface PoolConfig {
    connectionString?: string
    max?: number
    idleTimeoutMillis?: number
    connectionTimeoutMillis?: number
  }

  export class Client {
    constructor(config?: PoolConfig)
    connect(): Promise<void>
    end(): Promise<void>
    query<R extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<R>>
  }

  export class Pool {
    constructor(config?: PoolConfig)
    connect(): Promise<PoolClient>
    end(): Promise<void>
    query<R extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<R>>
  }

  const pg: {
    Client: typeof Client
    Pool: typeof Pool
  }

  export default pg
}
