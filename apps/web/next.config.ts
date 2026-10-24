import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@trackwise/shared", "@trackwise/database", "@trackwise/auth", "@trackwise/rbac", "@trackwise/messaging", "@trackwise/whatsapp", "@trackwise/telegram", "@trackwise/timer", "@trackwise/core"],
  serverExternalPackages: ["@prisma/client", "prisma"],
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
};

export default nextConfig;
