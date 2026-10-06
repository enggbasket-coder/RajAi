import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(__dirname, "../../../.env") });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/trackwise_test";
process.env.NODE_ENV = "test";
process.env.WHATSAPP_PROVIDER = "mock";
process.env.TELEGRAM_PROVIDER = "mock";
process.env.APP_URL = "http://localhost:3000";
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-0123456789abcdef";
