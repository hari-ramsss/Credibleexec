import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@credibleexec/domain",
    "@credibleexec/mandate",
    "@credibleexec/verifier",
  ],
  serverExternalPackages: ["@bazantic/cli", "@privy-io/server-auth"],
};

export default nextConfig;
