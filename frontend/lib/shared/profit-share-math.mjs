// แบ่งกำไรรายโปรเจกต์ (2026-10-24 · P-2 · docs/plans/2026-10-24-pre-incorporation.md ข้อ 4)
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ทุกยอดเป็นสตางค์ (BigInt) · ไฟล์นี้ห้ามใช้ API ของ Node หรือของเบราว์เซอร์
//
//   กำไรที่แบ่งได้
//   − ส่วนแบ่งแบบจำนวนเงินตายตัว (จ่ายก่อนตามที่ตกลง)
//   = กำไรหลังหักส่วนตายตัว
//   × % ของแต่ละคน (ปัดเศษสตางค์ลง) — กำไรหลังหักส่วนตายตัว ≤ 0 = ส่วนแบ่งแบบ % ได้ 0
//   เข้าเงินทุน = กำไรที่แบ่งได้ − ส่วนแบ่งทุกคน (รับเศษสตางค์ · ติดลบ = โปรเจกต์ขาดทุน)
//   → ผลรวมส่วนแบ่งทุกคน + เงินทุน = กำไรที่แบ่งได้ พอดีทุกสตางค์
import { parseHundredths } from "./money.mjs";

const HUNDRED_PERCENT = 10000n;

/**
 * @param {{ distributable: bigint, shares: { kind: "percent" | "fixed", percent?: string | null, amount?: string | null }[] }} input
 * @returns {{ fixedTotal: bigint, afterFixed: bigint, amounts: bigint[], companyAmount: bigint }}
 */
export function splitProfit({ distributable, shares }) {
    const fixedTotal = shares
        .filter((share) => share.kind === "fixed")
        .reduce((sum, share) => sum + parseHundredths(share.amount ?? "0", "จำนวนเงิน"), 0n);
    const afterFixed = distributable - fixedTotal;
    const amounts = shares.map((share) => {
        if (share.kind === "fixed") return parseHundredths(share.amount ?? "0", "จำนวนเงิน");
        if (afterFixed <= 0n) return 0n;
        const percent = parseHundredths(share.percent ?? "0", "เปอร์เซ็นต์");
        return (afterFixed * percent) / HUNDRED_PERCENT;
    });
    const companyAmount = distributable - amounts.reduce((sum, amount) => sum + amount, 0n);
    return { fixedTotal, afterFixed, amounts, companyAmount };
}

/** รวม % ของทุกคน (สตางค์ของเปอร์เซ็นต์ เช่น 100.00% = 10000n) */
export function percentTotalOf(shares) {
    return shares
        .filter((share) => share.kind === "percent")
        .reduce((sum, share) => sum + parseHundredths(share.percent ?? "0", "เปอร์เซ็นต์"), 0n);
}
