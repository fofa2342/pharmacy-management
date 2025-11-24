// database configuration
import 'dotenv/config'
import mysql from "mysql2/promise";

const {
  DB_HOST,
  DB_USER,
  DB_PASS,
  DB_NAME,
  DB_PORT
} = process.env;

if (!DB_HOST || !DB_USER || !DB_PASS || !DB_NAME) {
  throw new Error("Missing required database environment variables (DB_HOST, DB_USER, DB_PASS, DB_NAME)");
}

const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASS,
  port: Number(DB_PORT),
  database: DB_NAME,
  waitForConnections: true
});

export default pool;