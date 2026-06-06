/**
 * Install PostgreSQL triggers that make AuditEvent append-only — prevents
 * UPDATE and (optionally) DELETE on the table. Defense-in-depth for
 * compliance: even if a malicious actor with DB access tries to tamper
 * with the audit log, the trigger raises an exception and the statement
 * rolls back.
 *
 * Run after applying migrations: `npx tsx scripts/install-audit-triggers.ts`.
 * Idempotent — CREATE OR REPLACE on the functions, DROP/CREATE on triggers.
 *
 * UPDATE is always blocked. DELETE is only blocked in strict mode
 * (BCON_AUDIT_IMMUTABLE=true); otherwise DELETE is permitted so the
 * audit-prune cron can age out rows past the retention SLA.
 */

import "dotenv/config";
import { Client } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !/^postgres(ql)?:\/\//.test(connectionString)) {
    throw new Error("DATABASE_URL must be a postgresql:// connection string.");
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    // UPDATE guard — always installed.
    await client.query(`
      CREATE OR REPLACE FUNCTION audit_event_no_update() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'AuditEvent is append-only; UPDATE not permitted';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await client.query(`DROP TRIGGER IF EXISTS audit_event_no_update ON "AuditEvent";`);
    await client.query(`
      CREATE TRIGGER audit_event_no_update
        BEFORE UPDATE ON "AuditEvent"
        FOR EACH ROW EXECUTE FUNCTION audit_event_no_update();
    `);

    // DELETE guard — strict (immutable) mode only.
    await client.query(`DROP TRIGGER IF EXISTS audit_event_no_delete ON "AuditEvent";`);
    if (process.env.BCON_AUDIT_IMMUTABLE === "true") {
      await client.query(`
        CREATE OR REPLACE FUNCTION audit_event_no_delete() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'AuditEvent is append-only; DELETE blocked by BCON_AUDIT_IMMUTABLE';
        END;
        $$ LANGUAGE plpgsql;
      `);
      await client.query(`
        CREATE TRIGGER audit_event_no_delete
          BEFORE DELETE ON "AuditEvent"
          FOR EACH ROW EXECUTE FUNCTION audit_event_no_delete();
      `);
      console.log("audit triggers installed (immutable mode — UPDATE + DELETE blocked)");
    } else {
      console.log("audit triggers installed (UPDATE blocked; DELETE permitted for prune cron — set BCON_AUDIT_IMMUTABLE=true to lock)");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
