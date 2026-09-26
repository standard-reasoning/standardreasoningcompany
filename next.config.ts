import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared auth plane builds its OAuth consent URL from its Site URL, which
  // is this domain, and accepts only a path. Consent for the MCP connector lives
  // on austendewolf.com, so the request is handed there with its query intact.
  async redirects() {
    return [
      {
        source: "/oauth/consent",
        destination: "https://austendewolf.com/oauth/consent",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
