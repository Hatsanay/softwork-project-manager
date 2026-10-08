import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Backend already compresses/resizes uploaded images (sharp, webp) before storage,
  // so Next's own image optimizer (which needs sharp) is unnecessary.
  images: {
    unoptimized: true,
  },
  // ไม่บอกคนนอกว่าใช้ Next.js (ลดข้อมูลที่ช่วยเล็งช่องโหว่ตามเวอร์ชัน)
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // กันหน้าเว็บถูกฝังใน iframe ของเว็บอื่น (clickjacking)
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // ลิงก์ /share/<token> เป็นความลับ — ไม่ส่ง path เต็มไปใน Referer เวลาลูกค้ากดลิงก์ออกไปเว็บอื่น
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
