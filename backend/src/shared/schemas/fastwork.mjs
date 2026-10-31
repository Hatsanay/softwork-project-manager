// ตรวจข้อมูลงาน Fastwork (2026-10-24 · P-1 · docs/plans/2026-10-24-pre-incorporation.md ข้อ 3)
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
import { z } from "zod";
import { decimalText, integerInRange, optionalDate, optionalText, requiredDate, requiredText } from "./common.mjs";
import { catalogTasksField } from "./project.mjs";

export const MAX_FASTWORK_MILESTONES = 20;
const MAX_AMOUNT = "99999999.99";

const rate = (label) => decimalText(label, { minimum: "0", maximum: "100" });
const amount = (label) => decimalText(label, { minimum: "0", maximum: MAX_AMOUNT });
const version = integerInRange("เวอร์ชัน", 0, 2_000_000_000);

/** อัตราเริ่มต้นของรายการเงิน Fastwork (ตั้งค่า) */
export const fastworkSettingsSchema = z.object({
    cs_fastwork_fee_rate: rate("อัตราค่าธรรมเนียม Fastwork"),
    cs_fastwork_fee_vat_rate: rate("อัตรา VAT ของค่าธรรมเนียม"),
    cs_fastwork_wht_rate: rate("อัตราหัก ณ ที่จ่าย"),
});

const milestoneSchema = z.object({
    // มีเลข = งวดเดิม (แก้) · ไม่มี = งวดใหม่
    fwm_id: integerInRange("งวด", 1, 2_147_483_647).nullish().transform((value) => value ?? null),
    fwm_name: requiredText("ชื่องวด", 200),
    fwm_amount: decimalText("ราคางวด", { minimum: "0.01", maximum: MAX_AMOUNT }),
    fwm_due_date: optionalDate("กำหนดส่ง"),
});

export const milestonesField = z
    .array(milestoneSchema, { error: "กรุณาเพิ่มงวดงานอย่างน้อย 1 งวด" })
    .min(1, "กรุณาเพิ่มงวดงานอย่างน้อย 1 งวด")
    .max(MAX_FASTWORK_MILESTONES, `งวดงานได้ไม่เกิน ${MAX_FASTWORK_MILESTONES} งวด`);

const fastworkUrl = optionalText("ลิงก์หน้างาน", 500).refine((value) => value === null || /^https?:\/\//i.test(value), {
    message: "ลิงก์ต้องขึ้นต้นด้วย https://",
});

/** สร้างโปรเจกต์จากงาน Fastwork — ลูกค้าเลือกจากที่มี (client_id) หรือพิมพ์ชื่อใหม่ (client_name) */
export const fastworkProjectSchema = z
    .object({
        project_name: requiredText("ชื่องาน", 150),
        client_id: optionalText("ลูกค้า", 18),
        client_name: optionalText("ชื่อลูกค้า", 100),
        project_fastwork_order_no: optionalText("เลขคำสั่งซื้อ", 50),
        project_fastwork_url: fastworkUrl,
        project_description: optionalText("รายละเอียดงาน", 5000),
        project_type: z.enum(["waterfall", "agile"], { error: "เลือกรูปแบบโปรเจกต์" }).default("waterfall"),
        project_start_date: optionalDate("วันเริ่ม"),
        project_due_date: optionalDate("กำหนดส่งงาน"),
        milestones: milestonesField,
        // รับงานจากคำขอบริการ (S-5) · ว่าง = รับงานปกติ
        service_request_id: optionalText("คำขอบริการ", 18),
        // งานจากสินค้าที่เลือก (2026-10-31) · รับจากคำขอ = คำขอสร้างงานให้แล้ว ส่งซ้ำไม่ได้
        tasks: catalogTasksField,
    })
    .superRefine((project, context) => {
        if (!project.client_id && !project.client_name) {
            context.addIssue({ code: "custom", path: ["client_name"], message: "เลือกลูกค้าเดิม หรือพิมพ์ชื่อลูกค้าบน Fastwork" });
        }
        if (project.project_start_date && project.project_due_date && project.project_due_date < project.project_start_date) {
            context.addIssue({ code: "custom", path: ["project_due_date"], message: "กำหนดส่งต้องไม่ก่อนวันเริ่ม" });
        }
        if (project.service_request_id && project.tasks.length > 0) {
            context.addIssue({ code: "custom", path: ["tasks"], message: "รับงานจากคำขอ ระบบสร้างงานจากรายการในคำขอให้แล้ว · ไม่ต้องเลือกสินค้าเพิ่ม" });
        }
    });

/** แก้ข้อมูล Fastwork ของโปรเจกต์ + งวดงานทั้งชุด */
export const fastworkProjectUpdateSchema = z.object({
    project_fastwork_order_no: optionalText("เลขคำสั่งซื้อ", 50),
    project_fastwork_url: fastworkUrl,
    milestones: milestonesField,
});

/** เพิ่มงวดต่อท้ายงาน Fastwork เดิม (ลูกค้าจ้างเพิ่ม 2026-10-31) · งานในโปรเจกต์เพิ่มได้พร้อมกัน (ไม่บังคับ) */
export const fastworkAddMilestonesSchema = z.object({
    milestones: milestonesField,
    tasks: catalogTasksField,
});

const payoutAmounts = {
    fwp_fee: amount("ค่าธรรมเนียม"),
    fwp_fee_vat: amount("VAT ของค่าธรรมเนียม"),
    fwp_wht: amount("หัก ณ ที่จ่าย"),
    fwp_wht_certificate_no: optionalText("เลขที่ 50 ทวิ", 50),
};

const receivedFields = {
    fwp_received_date: requiredDate("วันที่เงินเข้า"),
    fwp_bank_account_id: requiredText("บัญชีที่รับเงิน", 18),
    fwp_reference: optionalText("เลขอ้างอิง", 100),
};

/** บันทึกเงินจาก Fastwork — status pending = ลูกค้ายืนยันงวดแล้ว รอโอน · received = เงินเข้าแล้ว */
export const fastworkPayoutSchema = z.discriminatedUnion(
    "fwp_status",
    [
        z.object({
            fwp_status: z.literal("pending"),
            fwp_project_id: requiredText("โปรเจกต์", 18),
            fwp_milestone_id: integerInRange("งวด", 1, 2_147_483_647).nullish().transform((value) => value ?? null),
            fwp_gross: decimalText("ราคางวด", { minimum: "0.01", maximum: MAX_AMOUNT }),
            fwp_fee_rate: rate("อัตราค่าธรรมเนียม"),
            fwp_approved_date: requiredDate("วันที่ลูกค้ายืนยันงวด"),
            fwp_note: optionalText("หมายเหตุ", 500),
            ...payoutAmounts,
        }),
        z.object({
            fwp_status: z.literal("received"),
            fwp_project_id: requiredText("โปรเจกต์", 18),
            fwp_milestone_id: integerInRange("งวด", 1, 2_147_483_647).nullish().transform((value) => value ?? null),
            fwp_gross: decimalText("ราคางวด", { minimum: "0.01", maximum: MAX_AMOUNT }),
            fwp_fee_rate: rate("อัตราค่าธรรมเนียม"),
            fwp_approved_date: requiredDate("วันที่ลูกค้ายืนยันงวด"),
            fwp_note: optionalText("หมายเหตุ", 500),
            ...payoutAmounts,
            ...receivedFields,
        }),
    ],
    { error: "เลือกสถานะ รอโอน หรือ เงินเข้าแล้ว" },
);

/** ยืนยันเงินเข้า (จากรายการรอโอน) — ยอดหักแก้ให้ตรงกับที่โอนจริงได้ */
export const fastworkReceiveSchema = z.object({
    ...payoutAmounts,
    ...receivedFields,
    fwp_version: version,
});

/** ยกเลิก (คืนเงินลูกค้า/ข้อพิพาท/บันทึกผิด) — ต้องมีเหตุผล ไม่ลบรายการ */
export const fastworkCancelSchema = z.object({
    reason: requiredText("เหตุผลที่ยกเลิก", 500),
    fwp_version: version,
});
