import { migrate } from "../src/lib/migrate";
import { bootstrapSuperAdmin } from "../src/services/platform";

/** Creates the first platform operator from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD. Safe to run once. */
async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL, pw = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !pw) throw new Error("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, then run again.");
  await migrate();
  await bootstrapSuperAdmin(email, pw);
  console.log(`Super admin created: ${email}\nRemove BOOTSTRAP_ADMIN_PASSWORD from your environment now.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
