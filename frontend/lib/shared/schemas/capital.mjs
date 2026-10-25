// ตรวจข้อมูลเงินทุนสะสม (2026-10-25 · P-3 · docs/plans/2026-10-24-pre-incorporation.md ข้อ 12)
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
import { z } from "zod";
import { decimalText, optionalDate, optionalText, requiredDate, requiredText } from "./common.mjs";

const MAX_AMOUNT = "9999999999.99";

/** เป้าเงินทุน · ว่าง = ยังไม่ตั้ง */
export const capitalGoalSchema = z.object({
    cs_capital_goal: z
        .union([z.string(), z.number(), z.null()])
        .optional()
        .transform((value, context) => {
            if (value === null || value === undefined || String(value).trim() === "") return null;
            const parsed = decimalText("เป้าเงินทุน", { minimum: "1", maximum: MAX_AMOUNT }).safeParse(value);
            if (parsed.success) return parsed.data;
            for (const issue of parsed.error.issues) context.addIssue({ code: "custom", message: issue.message });
            return z.NEVER;
        }),
    cs_capital_target_date: optionalDate("วันที่ตั้งใจจดบริษัท"),
});

/** ฝากเพิ่ม / ถอนออก · ถอนต้องบอกเหตุผล */
export const capitalEntrySchema = z
    .object({
        cpe_kind: z.enum(["deposit", "withdraw"], { error: "เลือกฝากเพิ่มหรือถอนออก" }),
        cpe_amount: decimalText("จำนวนเงิน", { minimum: "0.01", maximum: MAX_AMOUNT }),
        cpe_entry_date: requiredDate("วันที่"),
        cpe_note: optionalText("หมายเหตุ", 500),
    })
    .superRefine((entry, context) => {
        if (entry.cpe_kind === "withdraw" && !entry.cpe_note) {
            context.addIssue({ code: "custom", path: ["cpe_note"], message: "กรุณาบอกเหตุผลที่ถอน เช่น นำไปจดบริษัท" });
        }
    });

export const capitalCancelSchema = z.object({ reason: requiredText("เหตุผลที่ยกเลิก", 500) });
