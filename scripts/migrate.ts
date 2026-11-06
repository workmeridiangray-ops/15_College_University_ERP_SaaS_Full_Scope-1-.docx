import { migrate } from "../src/lib/migrate";
migrate().then((a) => { console.log(a.length ? `Applied: ${a.join(", ")}` : "Database up to date"); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
