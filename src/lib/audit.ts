import { query, type Queryable } from "./db";

export async function audit(
  actor: { id?: string | null; institutionId?: string | null },
  action: string,
  entity?: string,
  entityId?: string | null,
  detail?: Record<string, unknown>,
  q: Pick<Queryable, "query"> = { query }
) {
  await q.query(
    "INSERT INTO audit_log (institution_id, user_id, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5,$6)",
    [actor.institutionId ?? null, actor.id ?? null, action, entity ?? null, entityId ?? null, detail ? JSON.stringify(detail) : null]
  );
}
