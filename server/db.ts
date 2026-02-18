import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { logger } from "./logger";

const { Pool } = pg;

const RDS_DATABASE_URL = "postgresql://postgres:%24italakshmi1@dev1.c3gaww644kmf.us-east-2.rds.amazonaws.com:5432/postgres";

const databaseUrl = RDS_DATABASE_URL;

logger.db.info("Initializing database connection pool", { host: "dev1.c3gaww644kmf.us-east-2.rds.amazonaws.com", ssl: true });

export const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

pool.on("connect", () => {
  logger.db.debug("New database client connected");
});

pool.on("error", (err) => {
  logger.db.error("Database pool error", err);
});

export const db = drizzle(pool, { schema });

logger.db.info("Drizzle ORM initialized");
