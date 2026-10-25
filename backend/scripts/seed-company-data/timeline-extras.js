// งานเสริมให้ครบทุกตาราง (ข้อมูลจำลองชุดเต็ม 2026-10-24): อัตราแลกเปลี่ยน ธปท. · ชุดรายการสินค้า · ใบวางบิลเพิ่ม
// · ใบลดหนี้ที่ต้องคืนเงินลูกค้า · รหัสยืนยันอีเมล (OTP)
const { setToday } = require("./clock");
const { as } = require("./api");
const sales = require("./sales");
const data = require("./data");

const ACCOUNTANT = "kamonchanok";

/** อัตรา USD ของทุกวันทำการ ส.ค.-ต.ค. (ระบบดึงจาก ธปท. · สคริปต์ปิดการเรียกจริงจึงใส่เอง) — ขึ้นลงเล็กน้อยแบบกำหนดผลได้ */
async function insertExchangeRates(pool, { addDays, isWorkday }) {
    const rows = [];
    let step = 0;
    for (let date = "2026-08-03"; date <= "2026-10-23"; date = addDays(date, 1)) {
        if (!isWorkday(date)) continue;
        step += 1;
        const mid = data.USD_RATE_BASE + Math.sin(step / 6) * 0.35 + step * 0.004;
        const rate = (value) => value.toFixed(4);
        rows.push(["USD", date, rate(mid - 0.27), rate(mid - 0.13), rate(mid + 0.21), rate(mid), `${date} 18:05:00`]);
    }
    await pool.query(
        `INSERT INTO tb_exchange_rates (er_currency, er_rate_date, er_buying_sight, er_buying_transfer, er_selling, er_mid_rate, er_fetched_at)
         VALUES ?`,
        [rows],
    );
}

/** ชุดรายการสำเร็จรูปเพิ่ม (ใช้ทำใบเสนอราคาเร็ว) */
async function addProductPackages(ids) {
    const product = ids.products;
    const packages = [
        {
            pkg_name: "แอปมือถือ iOS + Android ขนาดกลาง",
            pkg_description: "ออกแบบ 15 หน้าจอ พัฒนาแอปทั้งสองระบบ ระบบหลังบ้าน และอัปโหลดขึ้นสโตร์",
            items: [
                { pki_type: "heading", pki_description: "ออกแบบ" },
                { pki_type: "item", pki_product_id: product.uxui.id, pki_description: product.uxui.name, pki_quantity: "15", pki_unit: "หน้าจอ", pki_unit_price: "2500" },
                { pki_type: "heading", pki_description: "พัฒนาและทดสอบ" },
                { pki_type: "item", pki_product_id: product.mobileDev.id, pki_description: product.mobileDev.name, pki_quantity: "30", pki_unit: "Man-day", pki_unit_price: "5000" },
                { pki_type: "item", pki_product_id: product.testing.id, pki_description: product.testing.name, pki_quantity: "8", pki_unit: "Man-day", pki_unit_price: "3500" },
                { pki_type: "item", pki_product_id: product.deploy.id, pki_description: "อัปโหลดขึ้น App Store และ Google Play", pki_quantity: "1", pki_unit: "งาน", pki_unit_price: "8000" },
            ],
        },
        {
            pkg_name: "ดูแลระบบรายปี (จ่ายรายเดือน)",
            pkg_description: "ดูแลเซิร์ฟเวอร์ สำรองข้อมูล อัปเดตความปลอดภัย แก้ไขปัญหาในเวลาทำการ",
            items: [
                { pki_type: "item", pki_product_id: product.maintenance.id, pki_description: product.maintenance.name, pki_quantity: "12", pki_unit: "เดือน", pki_unit_price: "6000" },
                { pki_type: "item", pki_product_id: product.hosting.id, pki_description: product.hosting.name, pki_quantity: "1", pki_unit: "ปี", pki_unit_price: "18000" },
                { pki_type: "note", pki_description: "ไม่รวมการพัฒนาฟีเจอร์ใหม่ (คิดเป็น Man-day ตามจริง)" },
            ],
        },
    ];
    for (const item of packages) {
        await as("siriporn", "POST", "/V1/product-packages", { pkg_category_id: null, pkg_status: "active", ...item });
    }
}

// ส่งลิงก์ติดตามความคืบหน้าให้ลูกค้า (หน้า /share ของโปรเจกต์) — [โปรเจกต์, วันที่, เวลา, ข้อความ]
const SHARE_LINK_EMAILS = [
    ["tour", "2026-05-04", "15:30", "เริ่มพัฒนาระบบจองทัวร์แล้วครับ ดูความคืบหน้าได้ตลอดจากลิงก์นี้ ไม่ต้องเข้าระบบ"],
    ["tour", "2026-07-31", "16:00", "งานพร้อมส่งมอบแล้วครับ ความคืบหน้าในลิงก์เป็น 100% รบกวนตรวจรับภายในสัปดาห์หน้า"],
    ["clinic", "2026-05-13", "14:00", "เรียนคุณหมอ ส่งลิงก์ติดตามงานเว็บไซต์คลินิกครับ อัปเดตทุกสัปดาห์"],
    ["resort", "2026-06-01", "15:00", "ลิงก์ติดตามความคืบหน้าระบบจองห้องพักครับ รวมกำหนดส่งแต่ละงวด"],
    ["resort", "2026-09-25", "10:30", "แจ้งกำหนดติดตั้งระบบจริงคืนวันที่ 30 ก.ย. หลังปิดรับจอง ดูรายละเอียดในลิงก์ครับ"],
    ["palm", "2026-07-21", "16:20", "ลิงก์ติดตามงานระบบรับซื้อผลปาล์มครับ ทีมจะเข้าหน้างานทุกวันพฤหัส"],
    ["dive", "2026-08-25", "17:00", "Here is the live progress link for the dive booking app. No login needed."],
];

/**
 * @param {{ on: Function, ids: object, state: object, pool: import("mysql2/promise").Pool }} context
 */
function scheduleExtras({ on, ids, state }) {
    const invoices = state.invoices;

    for (const [projectKey, date, time, message] of SHARE_LINK_EMAILS) {
        on(date, `ส่งลิงก์ติดตามงานให้ลูกค้า ${projectKey}`, async () => {
            setToday(date, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
            await as("nattapon", "POST", `/V1/projects/${state.projects[projectKey]}/share/send-email`, { message });
        });
    }
    // โปรเจกต์ภายในไม่มีลูกค้า — ปิดลิงก์สาธารณะไว้
    on("2026-05-04", "ปิดลิงก์ลูกค้าของโปรเจกต์ภายใน", () =>
        as("nattapon", "PUT", `/V1/projects/${state.projects.internal}/share/toggle`, { project_share_enabled: false }),
    );

    // ใบวางบิลงวด 3 ระบบจองห้องพัก (ลูกค้ารวบรวมจ่ายตามรอบวางบิล)
    on("2026-10-06", "ใบวางบิล งวด 3 ระบบจองห้องพัก", async () => {
        state.resortBillingNote = await sales.billingNote(ACCOUNTANT, ids.clients.andamanResort, [invoices.resort3], "2026-11-05");
    });

    // ลูกค้าจ่ายค่าดูแลระบบ ก.ย. ครบแล้ว ต่อมาระบบล่ม 2 วัน → ลดหนี้ชดเชย → ต้องโอนคืนส่วนที่จ่ายเกิน
    on("2026-09-18", "ใบลดหนี้ชดเชยระบบล่ม (ลูกค้าจ่ายแล้ว)", async () => {
        state.downtimeCredit = await sales.creditNote(ACCOUNTANT, "hatsanai", {
            cn_invoice_id: invoices["maintenance-2026-09-01"],
            cn_reason_code: "defect",
            cn_reason: "ระบบจองทัวร์ใช้งานไม่ได้ 2 วัน (16-17 ก.ย.) จากผู้ให้บริการคลาวด์ ชดเชยค่าบริการตามสัญญาดูแลระบบ",
            lines: [{ cnl_description: "ชดเชยค่าบริการดูแลระบบ 2 วัน เดือนกันยายน 2569", cnl_amount: "400" }],
        });
    });
    on("2026-09-25", "โอนคืนเงินลูกค้าตามใบลดหนี้", async () => {
        const detail = await as(ACCOUNTANT, "GET", `/V1/credit-notes/${state.downtimeCredit}`);
        const creditNote = detail.credit_note ?? detail;
        // ลูกค้าหัก ณ ที่จ่าย 3% ไว้แล้ว: คืนเป็นเงิน 97% ส่วน 3% ไม่ต้องคืน (ลูกค้านำส่งกรมสรรพากรแทนเราแล้ว)
        await as(ACCOUNTANT, "POST", `/V1/credit-notes/${state.downtimeCredit}/refund`, {
            cn_refund_date: "2026-09-25",
            cn_refund_bank_account_id: ids.bankAccount,
            cn_refund_amount: "388.00",
            cn_refund_wht: "12.00",
            cn_refund_reference: "KTB 25/09 14:12",
            cn_refund_note: "โอนคืนเข้าบัญชีกระบี่ ฮอลิเดย์ ทัวร์",
            cn_version: creditNote.cn_version,
        });
    });

    // รหัสยืนยันอีเมล: ระบบลบรหัสที่หมดอายุเกิน 1 วันเอง จึงมีเฉพาะของช่วงท้าย (ใช้แล้ว 1 · ยังไม่ใช้ 1)
    on("2026-10-22", "อภิชาติยืนยันอีเมลใหม่ด้วย OTP", async () => {
        setToday("2026-10-22", 16, 5);
        const { issueOtp, consumeOtp, markOtpUsed } = require("../../src/utils/emailOtp");
        const email = "apichart.w@softwork.fasttiw.com";
        const { code } = await issueOtp({ email, purpose: "verify_email", userId: ids.users.apichart });
        setToday("2026-10-22", 16, 7);
        const otpId = await consumeOtp({ email, purpose: "verify_email", userId: ids.users.apichart, code });
        await markOtpUsed(otpId);
    });
    on("2026-10-23", "ปวีณาขอรหัสยืนยันอีเมล (ยังไม่กรอก)", async () => {
        setToday("2026-10-23", 11, 40);
        const { issueOtp } = require("../../src/utils/emailOtp");
        await issueOtp({ email: "pawinee.t@softwork.fasttiw.com", purpose: "verify_email", userId: ids.users.pawinee });
    });
}

module.exports = { scheduleExtras, insertExchangeRates, addProductPackages };
