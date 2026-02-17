import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const RDS_DATABASE_URL = "postgresql://postgres:%24italakshmi1@dev1.c3gaww644kmf.us-east-2.rds.amazonaws.com:5432/postgres";

const databaseUrl = process.env.DATABASE_URL || RDS_DATABASE_URL;

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });
