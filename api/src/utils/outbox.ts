/** Minimal interface needed to run an outbox INSERT — satisfied by PgClient.query and identityDb.adminQuery. */
export type OutboxQueryRunner = (sql: string, params: unknown[]) => Promise<unknown>;

/**
 * Initiator metadata persisted alongside an outbox event so the email
 * dispatch resolver (resolveEmailDispatch in identityEmailOutboxHelpers) can
 * pick a sender / SMTP transport based on which actor enqueued the work.
 *
 * Columns added by identity migration 24_outbox_initiator_columns.sql. All
 * fields are nullable; pre-Phase-1.3 enqueue sites that don't pass an
 * initiator continue to work and resolve to the platform default sender.
 */
export type OutboxInitiator = {
  /** App-DB user_id of the actor that enqueued this event. */
  initiated_by_user_id?: string | null;
  /**
   * Pre-resolved app-DB excursions.reseller.id when the actor was acting
   * as a reseller user. When set, the dispatch resolver skips the
   * actor-membership lookup and uses this reseller directly.
   */
  initiated_by_reseller_id?: string | null;
  /** App-DB tenant id for the initiator scope (needed to look up reseller). */
  initiator_tenant_id?: string | null;
  /** App-DB project id for the initiator scope. */
  initiator_project_id?: string | null;
};

const COLUMNS_BASE =
  "topic,key,payload,initiated_by_user_id,initiated_by_reseller_id,initiator_tenant_id,initiator_project_id";
const VALUES_BASE = "$1,$2,$3,$4,$5,$6,$7";

const BASE = `INSERT INTO ops.outbox_event(${COLUMNS_BASE}) VALUES (${VALUES_BASE})`;

const ON_CONFLICT_DO_NOTHING =
  `${BASE} ON CONFLICT (topic,key) WHERE key IS NOT NULL DO NOTHING`;

const ON_CONFLICT_REQUEUE =
  `${BASE} ON CONFLICT (topic,key) WHERE key IS NOT NULL DO UPDATE SET`
  + " payload=EXCLUDED.payload,"
  + " status='pending',"
  + " attempt_count=0,"
  + " next_attempt_at=now(),"
  + " last_error=NULL,"
  + " locked_at=NULL,"
  + " locked_by=NULL,"
  + " initiated_by_user_id=EXCLUDED.initiated_by_user_id,"
  + " initiated_by_reseller_id=EXCLUDED.initiated_by_reseller_id,"
  + " initiator_tenant_id=EXCLUDED.initiator_tenant_id,"
  + " initiator_project_id=EXCLUDED.initiator_project_id,"
  + " updated_at=now()";

const buildParams = (
  topic: string,
  key: string,
  payload: Record<string, unknown>,
  initiator: OutboxInitiator | undefined,
): unknown[] => [
  topic,
  key,
  payload,
  initiator?.initiated_by_user_id ?? null,
  initiator?.initiated_by_reseller_id ?? null,
  initiator?.initiator_tenant_id ?? null,
  initiator?.initiator_project_id ?? null,
];

/** Insert a new outbox event. Each call must use a unique key. */
export const insertOutboxEvent = async (
  run: OutboxQueryRunner,
  topic: string,
  key: string,
  payload: Record<string, unknown>,
  initiator?: OutboxInitiator,
): Promise<void> => {
  await run(BASE, buildParams(topic, key, payload, initiator));
};

/** Insert an outbox event; silently skip if the same (topic, key) already exists. */
export const insertOutboxEventIfNew = async (
  run: OutboxQueryRunner,
  topic: string,
  key: string,
  payload: Record<string, unknown>,
  initiator?: OutboxInitiator,
): Promise<void> => {
  await run(ON_CONFLICT_DO_NOTHING, buildParams(topic, key, payload, initiator));
};

/**
 * Insert an outbox event, or reset it to pending if the key already exists.
 * Use this when the same logical event may be re-triggered (e.g. re-send quote email).
 *
 * On conflict, the initiator columns are also updated so a re-send under a
 * different actor (e.g. a reseller agent retrying a quote send) carries the
 * latest initiator metadata into the dispatch resolver.
 */
export const requeueOutboxEvent = async (
  run: OutboxQueryRunner,
  topic: string,
  key: string,
  payload: Record<string, unknown>,
  initiator?: OutboxInitiator,
): Promise<void> => {
  await run(ON_CONFLICT_REQUEUE, buildParams(topic, key, payload, initiator));
};
