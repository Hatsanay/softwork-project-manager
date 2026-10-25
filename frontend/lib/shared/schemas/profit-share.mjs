// ตรวจข้อมูลส่วนแบ่งกำไร (2026-10-24 · P-2 · docs/plans/2026-10-24-pre-incorporation.md ข้อ 4)
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
import { z } from "zod";
import { parseHundredths } from "../money.mjs";
import { percentTotalOf } from "../profit-share-math.mjs";
import { decimalText, integerInRange, optionalText, requiredDate, requiredText } from "./common.mjs";

export const MAX_SHARES_PER_PROJECT = 30;
const MAX_AMOUNT = "99999999.99";
const version = integerInRange("เวอร์ชัน", 0, 2_000_000_000);

const recipientFields = {
    recipient_type: z.enum(["user", "vendor"], { error: "เลือกผู้รับเป็นผู้ใช้ในระบบหรือผู้ขาย/ฟรีแลนซ์" }),
    recipient_id: requiredText("ผู้รับ", 18),
};

const shareSchema = z
    .object({
        ...recipientFields,
        kind: z.enum(["percent", "fixed"], { error: "เลือกแบ่งเป็น % หรือจำนวนเงิน" }),
        percent: z.union([z.string(), z.number()]).nullish(),
        amount: z.union([z.string(), z.number()]).nullish(),
        note: optionalText("หน้าที่ในงาน", 100),
    })
    .transform((share, context) => {
        const field = share.kind === "percent" ? "percent" : "amount";
        const parsed = (share.kind === "percent"
            ? decimalText("เปอร์เซ็นต์", { minimum: "0.01", maximum: "100" })
            : decimalText("จำนวนเงิน", { minimum: "0.01", maximum: MAX_AMOUNT })
        ).safeParse(share[field] ?? "");
        if (!parsed.success) {
            for (const issue of parsed.error.issues) context.addIssue({ code: "custom", path: [field], message: issue.message });
            return z.NEVER;
        }
        return {
            recipient_type: share.recipient_type,
            recipient_id: share.recipient_id,
            kind: share.kind,
            percent: share.kind === "percent" ? parsed.data : null,
            amount: share.kind === "fixed" ? parsed.data : null,
            note: share.note,
        };
    });

/** ตั้งส่วนแบ่งทั้งชุดของโปรเจกต์ (แทนชุดเดิม) — ผู้รับซ้ำไม่ได้ · % รวมไม่เกิน 100 */
export const projectSharesSchema = z
    .object({
        shares: z.array(shareSchema).max(MAX_SHARES_PER_PROJECT, `ผู้รับส่วนแบ่งได้ไม่เกิน ${MAX_SHARES_PER_PROJECT} คน`),
    })
    .superRefine(({ shares }, context) => {
        const seen = new Set();
        shares.forEach((share, index) => {
            const key = `${share.recipient_type}:${share.recipient_id}`;
            if (seen.has(key)) context.addIssue({ code: "custom", path: ["shares", index, "recipient_id"], message: "ผู้รับคนนี้มีอยู่แล้ว" });
            seen.add(key);
        });
        if (percentTotalOf(shares) > 10000n) {
            context.addIssue({ code: "custom", path: ["shares"], message: "รวม % ของทุกคนเกิน 100% · ส่วนที่เหลือจาก 100% คือเงินที่เก็บเข้าทุน" });
        }
    });

/** เบิกส่วนแบ่งล่วงหน้า (จ่ายแล้วทันที) */
export const shareAdvanceSchema = z.object({
    ...recipientFields,
    amount: decimalText("จำนวนเงิน", { minimum: "0.01", maximum: MAX_AMOUNT }),
    paid_date: requiredDate("วันที่จ่าย"),
    bank_account_id: requiredText("บัญชีที่โอนออก", 18),
    reference: optionalText("เลขอ้างอิงการโอน", 100),
    note: optionalText("หมายเหตุ", 500),
});

export const shareCancelSchema = z.object({ reason: requiredText("เหตุผลที่ยกเลิก", 500) });

/** ยอดเงินที่ติดลบได้ เช่น กำไรที่แบ่งได้ของโปรเจกต์ขาดทุน */
const signedAmount = (label) =>
    z.string({ error: `กรุณาส่ง${label}` }).refine((value) => {
        try {
            parseHundredths(value.replace(/^-/, ""), label);
            return true;
        } catch {
            return false;
        }
    }, `${label}ไม่ถูกต้อง`);

/** ปิดยอด — expected_distributable = ตัวเลขที่ผู้ใช้เห็นตอนกด (เปลี่ยนระหว่างนั้น = ให้โหลดใหม่ ไม่ปิดยอดด้วยตัวเลขที่ไม่ได้ดู) */
export const settleSchema = z.object({
    settled_date: requiredDate("วันที่ปิดยอด"),
    note: optionalText("หมายเหตุ", 500),
    expected_distributable: signedAmount("กำไรที่แบ่งได้"),
});

export const settlementCancelSchema = z.object({
    reason: requiredText("เหตุผลที่ยกเลิกการปิดยอด", 500),
    sst_version: version,
});

/** บันทึกจ่ายส่วนแบ่ง (หรือรับเงินคืนเมื่อต้องจ่ายติดลบ) — หัก ณ ที่จ่ายเฉพาะตอนจ่ายออก */
export const sharePaymentSchema = z.object({
    paid_date: requiredDate("วันที่โอน"),
    bank_account_id: requiredText("บัญชี", 18),
    reference: optionalText("เลขอ้างอิงการโอน", 100),
    wht: decimalText("หัก ณ ที่จ่าย", { minimum: "0", maximum: MAX_AMOUNT }).default("0.00"),
    ssl_version: version,
});
