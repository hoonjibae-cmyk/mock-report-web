import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@resvg/resvg-js"],
  outputFileTracingIncludes: {
    "/api/placement/summary/*": ["./public/fonts/NanumGothic-Regular.ttf"],
    "/api/admin/template": ["./public/template/score-input-template-2026.xlsx"],
  },
};

export default nextConfig;
