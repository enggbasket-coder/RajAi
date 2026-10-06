import { execSync } from "node:child_process";
import path from "node:path";
import { config } from "dotenv";

export default async function () {
  config({ path: path.resolve(__dirname, "../../../.env") });
  const url = process.env.TEST_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/trackwise_test";
  process.env.DATABASE_URL = url;
  execSync("npx prisma migrate deploy", { cwd: path.resolve(__dirname, "../../database"), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
