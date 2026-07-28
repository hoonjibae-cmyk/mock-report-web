import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/admin/template": ["./public/template/score-input-template-2026.xlsx"],
  },
};

export default nextConfig;
