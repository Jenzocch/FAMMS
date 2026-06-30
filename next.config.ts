import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Incident/PM photos are served from Supabase Storage public URLs
    // (https://<project>.supabase.co/storage/v1/object/public/...). next/image
    // refuses to load remote hosts that aren't allowlisted, which made the
    // detail-page thumbnails appear blank.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
