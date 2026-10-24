// เหตุการณ์ของบริษัทตามวันที่ (เม.ย. – 23 ต.ค. 2026 · ลงเวลา/OT/WFH อยู่ใน timeline-attendance.js · แชต/issue อยู่ใน timeline-collab.js) — เรียงวันก่อนรัน แต่ละเหตุการณ์ตั้งนาฬิกาจำลองเป็นวันนั้น
// อ่านจากบนลงล่างได้เหมือนบันทึกประจำวันของบริษัท · ค่าที่ขั้นหลังต้องใช้เก็บใน state
const { setToday } = require("./clock");
const { as, forgetTokens } = require("./api");
const data = require("./data");
const sales = require("./sales");
const purchasing = require("./purchasing");
const people = require("./people");
const projects = require("./projects");
const { addEmployee } = require("./setup");
const { scheduleAttendance } = require("./timeline-attendance");
const { scheduleCollaboration } = require("./timeline-collab");
const { scheduleExtras, insertExchangeRates, addProductPackages } = require("./timeline-extras");
const { weekdayIndex } = require("../../src/shared/payroll-math.mjs");

const LAST_DAY = "2026-10-23";
// ประเภทลา (ค่าเริ่มต้นของระบบ) — ลาพักร้อนใช้ได้เมื่อทำงานครบ 1 ปี บริษัทเริ่ม ม.ค. 2026 จึงยังไม่มีใครใช้
const LEAVE = { sick: 1, personal: 2 };

// ─── ตัวช่วยวันที่ ─────────────────────────────────────────────────────────────────────────
function addDays(dateText, days) {
    const date = new Date(`${dateText}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
const weekdayOf = (dateText) => new Date(`${dateText}T00:00:00Z`).getUTCDay(); // 0 = อาทิตย์
const holidays = new Set(data.HOLIDAYS_2026.map(([date]) => date));
const isWorkday = (dateText) => weekdayOf(dateText) >= 1 && weekdayOf(dateText) <= 5 && !holidays.has(dateText);
const isHoliday = (dateText) => holidays.has(dateText);
const money = (value) => (Math.round(value * 100) / 100).toFixed(2);

// ─── ตัวจัดคิวเหตุการณ์ ────────────────────────────────────────────────────────────────────
const events = [];
function on(date, label, run) {
    events.push({ date, label, run, order: events.length });
}

async function runTimeline({ ids, pool }) {
    const state = { quotations: {}, projects: {}, invoices: {}, leaveDays: new Map(), userIds: ids.users };
    const user = (username) => ids.users[username];

    scheduleSales(ids, state, user);
    scheduleProjects(ids, state, user);
    schedulePurchasing(ids, state);
    schedulePeople(ids, state);
    scheduleTimesheets(state);
    // หลัง schedulePeople: ต้องรู้วันลาที่อนุมัติแล้ว (ไม่กดเข้า/ออกวันลา)
    scheduleAttendance({ on, ids, state, addDays, isHoliday, weekdayIndex, lastDay: LAST_DAY });
    scheduleCollaboration({ on, state });
    scheduleExtras({ on, ids, state });

    // ก่อนเริ่มเหตุการณ์ (1 เม.ย.): อัตราแลกเปลี่ยนที่ ธปท. ประกาศ · ชุดรายการสินค้าเพิ่ม
    await insertExchangeRates(pool, { addDays, isWorkday });
    await addProductPackages(ids);

    events.sort((first, second) => first.date.localeCompare(second.date) || first.order - second.order);
    let currentMonth = null;
    let loginDate = "";
    for (const event of events) {
        setToday(event.date, 10);
        // token ออกตามนาฬิกาจำลองและมีอายุจำกัด — เข้าระบบใหม่ทุก 5 วัน
        if (event.date >= addDays(loginDate || event.date, 5) || !loginDate) {
            forgetTokens();
            loginDate = event.date;
        }
        if (event.date.slice(0, 7) !== currentMonth) {
            currentMonth = event.date.slice(0, 7);
            console.log(`── ${currentMonth}`);
        }
        try {
            await event.run();
        } catch (error) {
            throw new Error(`${event.date} ${event.label}: ${error.message}`);
        }
    }
    console.log(`✓ เหตุการณ์ทั้งหมด ${events.length} รายการ`);
}

// ═══ ขาย ═══════════════════════════════════════════════════════════════════════════════════
function scheduleSales(ids, state, user) {
    const product = ids.products;
    const line = sales.productLine;
    const clients = ids.clients;
    const q = state.quotations;
    const inv = state.invoices;
    const accountant = "kamonchanok";
    const bank = ids.bankAccount;

    // ── 1) กระบี่ ฮอลิเดย์ ทัวร์: เว็บไซต์และระบบจองทัวร์ (ปิดงานแล้ว · ต่อด้วยสัญญาดูแลรายเดือน)
    on("2026-04-20", "ใบเสนอราคา ระบบจองทัวร์", async () => {
        q.tour = await sales.createQuotation("thanawat", {
            qt_client_id: clients.krabiHoliday,
            qt_title: "พัฒนาเว็บไซต์และระบบจองทัวร์ออนไลน์",
            qt_payment_mode: "milestones",
            items: [
                sales.heading("วิเคราะห์และออกแบบ"),
                line(product.analysis, 1),
                line(product.uxui, 10, { description: "ออกแบบหน้าจอเว็บไซต์และขั้นตอนการจอง (10 หน้าจอ)" }),
                sales.heading("พัฒนาระบบ"),
                line(product.webDev, 12, { description: "ระบบจองทัวร์ ปฏิทินที่นั่งว่าง และชำระเงินผ่าน QR" }),
                line(product.webDev, 8, { description: "ระบบหลังบ้านจัดการทัวร์ ราคา และรายงานยอดจอง" }),
                sales.heading("ติดตั้งและส่งมอบ"),
                line(product.deploy, 1),
                line(product.training, 1),
                sales.note("รับประกันแก้ไขข้อผิดพลาด 90 วันหลังส่งมอบ · ไม่รวมค่าธรรมเนียมช่องทางชำระเงิน"),
            ],
            milestones: [
                { qtm_name: "มัดจำเมื่อลงนามสัญญา", qtm_percent: "30" },
                { qtm_name: "ส่งมอบหน้าเว็บและระบบจอง (ทดสอบ)", qtm_percent: "40" },
                { qtm_name: "ส่งมอบงานและเปิดใช้งานจริง", qtm_percent: "30" },
            ],
        });
        await sales.submitAndApprove("thanawat", q.tour, ["siriporn"]);
    });
    on("2026-04-21", "ส่งใบเสนอราคา ระบบจองทัวร์", () => sales.sendQuotation("thanawat", q.tour));
    on("2026-04-28", "ลูกค้าตอบรับ ระบบจองทัวร์", async () => {
        state.projects.tour = await sales.acceptQuotation("thanawat", q.tour);
    });
    on("2026-05-04", "ใบแจ้งหนี้งวด 1 ระบบจองทัวร์", async () => {
        inv.tour1 = await sales.invoiceMilestone(accountant, q.tour, 0);
    });
    on("2026-05-15", "รับเงินงวด 1 ระบบจองทัวร์", async () => {
        const amount = await sales.outstandingOf(accountant, inv.tour1);
        await sales.receivePayment(accountant, {
            clientId: clients.krabiHoliday, date: "2026-05-15", bankAccountId: bank,
            invoices: [{ id: inv.tour1, amount }], wht: money(amount * 0.03), whtCertificateNo: "KHT-2569/0412",
            reference: "KTB 15/05 10:42",
        });
    });
    on("2026-06-15", "ใบแจ้งหนี้งวด 2 ระบบจองทัวร์", async () => {
        inv.tour2 = await sales.invoiceMilestone(accountant, q.tour, 1);
    });
    on("2026-06-30", "รับเงินงวด 2 ระบบจองทัวร์", async () => {
        const amount = await sales.outstandingOf(accountant, inv.tour2);
        await sales.receivePayment(accountant, {
            clientId: clients.krabiHoliday, date: "2026-06-30", bankAccountId: bank,
            invoices: [{ id: inv.tour2, amount }], wht: money(amount * 0.03), whtCertificateNo: "KHT-2569/0588",
        });
    });
    on("2026-07-20", "ใบแจ้งหนี้งวด 3 ระบบจองทัวร์", async () => {
        inv.tour3 = await sales.invoiceMilestone(accountant, q.tour, 2);
    });
    on("2026-07-22", "ใบลดหนี้ ส่งมอบล่าช้า", async () => {
        await sales.creditNote(accountant, "hatsanai", {
            cn_invoice_id: inv.tour3,
            cn_reason_code: "price_reduction",
            cn_reason: "ส่วนลดเนื่องจากส่งมอบระบบล่าช้ากว่ากำหนด 1 สัปดาห์ ตามที่ตกลงกับลูกค้า",
            lines: [{ cnl_description: "ส่วนลดค่าพัฒนาระบบ งวดที่ 3", cnl_amount: "5000" }],
        });
    });
    on("2026-08-03", "รับเงินงวด 3 ระบบจองทัวร์ (หลังลดหนี้)", async () => {
        const amount = await sales.outstandingOf(accountant, inv.tour3);
        await sales.receivePayment(accountant, {
            clientId: clients.krabiHoliday, date: "2026-08-03", bankAccountId: bank,
            invoices: [{ id: inv.tour3, amount }], wht: money(amount * 0.03), whtCertificateNo: "KHT-2569/0731",
        });
    });
    // สัญญาดูแลระบบรายเดือน (ใบแจ้งหนี้สร้างเอง ต้องอนุมัติ)
    const maintenanceMonths = [
        ["2026-08-03", "สิงหาคม 2569", "2026-08-14"],
        ["2026-09-01", "กันยายน 2569", "2026-09-15"],
        ["2026-10-01", "ตุลาคม 2569", null],
    ];
    for (const [issueDate, monthName, paidDate] of maintenanceMonths) {
        const key = `maintenance-${issueDate}`;
        on(issueDate, `ใบแจ้งหนี้ค่าดูแลระบบ ${monthName}`, async () => {
            inv[key] = await sales.manualInvoice(accountant, "hatsanai", {
                inv_client_id: clients.krabiHoliday,
                inv_title: `ค่าบริการดูแลระบบเว็บไซต์และระบบจองทัวร์ ประจำเดือน${monthName}`,
                inv_credit_days: 15,
                inv_wht_rate: "3",
                inv_bank_account_id: bank,
                inv_project_id: state.projects.tour,
                items: [
                    {
                        invi_type: "item", invi_product_id: product.maintenance.id,
                        invi_description: `บริการดูแลระบบรายเดือน (${monthName}) สำรองข้อมูล อัปเดตความปลอดภัย แก้ไขปัญหา`,
                        invi_quantity: "1", invi_unit: "เดือน", invi_unit_price: "6000",
                    },
                ],
            });
        });
        if (paidDate) {
            on(paidDate, `รับเงินค่าดูแลระบบ ${monthName}`, async () => {
                const amount = await sales.outstandingOf(accountant, inv[key]);
                await sales.receivePayment(accountant, {
                    clientId: clients.krabiHoliday, date: paidDate, bankAccountId: bank,
                    invoices: [{ id: inv[key], amount }], wht: money(amount * 0.03),
                    whtCertificateNo: `KHT-2569/${paidDate.slice(5, 7)}88`,
                });
            });
        }
    }

    // ── 2) คลินิกทันตกรรมยิ้มสดใส: เว็บไซต์คลินิก + นัดหมายออนไลน์ (ลูกค้าบุคคล ไม่หัก ณ ที่จ่าย)
    on("2026-05-06", "ใบเสนอราคา เว็บไซต์คลินิก", async () => {
        q.clinic = await sales.createQuotation("siriporn", {
            qt_client_id: clients.smileClinic,
            qt_title: "เว็บไซต์คลินิกทันตกรรมพร้อมระบบนัดหมายออนไลน์",
            qt_payment_mode: "milestones",
            items: [
                sales.heading("ออกแบบและพัฒนา"),
                line(product.uxui, 8),
                line(product.webDev, 12, { description: "เว็บไซต์ 8 หน้า และระบบนัดหมายออนไลน์แจ้งเตือนทาง LINE" }),
                sales.heading("ติดตั้งและเปิดใช้งาน"),
                line(product.deploy, 1),
                line(product.hosting, 1),
                line(product.domain, 1, { description: "จดโดเมน smileclinic-krabi.com รายปี" }),
            ],
            milestones: [
                { qtm_name: "มัดจำ", qtm_percent: "50" },
                { qtm_name: "ส่งมอบและเปิดใช้งาน", qtm_percent: "50" },
            ],
        });
        await sales.submitAndApprove("siriporn", q.clinic, ["hatsanai"]);
    });
    on("2026-05-07", "ส่งใบเสนอราคา เว็บไซต์คลินิก", () => sales.sendQuotation("siriporn", q.clinic));
    on("2026-05-12", "ลูกค้าตอบรับ เว็บไซต์คลินิก", async () => {
        state.projects.clinic = await sales.acceptQuotation("siriporn", q.clinic);
    });
    on("2026-05-13", "ใบแจ้งหนี้มัดจำ เว็บไซต์คลินิก", async () => {
        inv.clinic1 = await sales.invoiceMilestone(accountant, q.clinic, 0);
    });
    on("2026-05-14", "รับเงินสด มัดจำเว็บไซต์คลินิก", async () => {
        const amount = await sales.outstandingOf(accountant, inv.clinic1);
        await sales.receivePayment(accountant, {
            clientId: clients.smileClinic, date: "2026-05-14", method: "cash", invoices: [{ id: inv.clinic1, amount }],
        });
    });
    on("2026-07-10", "ใบแจ้งหนี้งวดสุดท้าย เว็บไซต์คลินิก", async () => {
        inv.clinic2 = await sales.invoiceMilestone(accountant, q.clinic, 1);
    });
    on("2026-07-17", "รับเงินงวดสุดท้าย เว็บไซต์คลินิก", async () => {
        const amount = await sales.outstandingOf(accountant, inv.clinic2);
        await sales.receivePayment(accountant, {
            clientId: clients.smileClinic, date: "2026-07-17", bankAccountId: bank, invoices: [{ id: inv.clinic2, amount }],
            reference: "พร้อมเพย์ 17/07",
        });
    });

    // ── 3) อันดามัน บีช รีสอร์ท: ระบบจองห้องพักและจัดการโรงแรม (ยอดเกิน 300,000 อนุมัติ 2 ชั้น)
    on("2026-05-18", "ใบเสนอราคา ระบบจองห้องพัก", async () => {
        q.resort = await sales.createQuotation("thanawat", {
            qt_client_id: clients.andamanResort,
            qt_title: "ระบบจองห้องพักออนไลน์และบริหารจัดการโรงแรม",
            qt_payment_mode: "milestones",
            qt_valid_days: 45,
            items: [
                sales.heading("วิเคราะห์และออกแบบ"),
                line(product.analysis, 1),
                line(product.uxui, 18, { description: "ออกแบบหน้าจอเว็บไซต์จองห้อง และระบบหลังบ้าน (18 หน้าจอ)" }),
                sales.heading("พัฒนาระบบ"),
                line(product.webDev, 25, { description: "ระบบจองห้องพัก ปฏิทินห้องว่าง ราคาตามฤดูกาล และชำระเงินออนไลน์" }),
                line(product.webDev, 20, { description: "ระบบหลังบ้าน: เช็กอิน/เช็กเอาต์ แม่บ้าน และรายงานรายได้" }),
                line(product.testing, 10),
                sales.heading("ติดตั้งและส่งมอบ"),
                line(product.deploy, 1),
                line(product.training, 2, { description: "ฝึกอบรมพนักงานต้อนรับและฝ่ายบัญชี (2 รอบ)" }),
            ],
            milestones: [
                { qtm_name: "มัดจำเมื่อลงนามสัญญา", qtm_percent: "30" },
                { qtm_name: "ส่งมอบการออกแบบและระบบจอง (ทดสอบ)", qtm_percent: "30" },
                { qtm_name: "ส่งมอบระบบหลังบ้านและเปิดใช้งาน", qtm_percent: "30" },
                { qtm_name: "ครบระยะรับประกัน 90 วัน", qtm_percent: "10" },
            ],
        });
        await sales.submitAndApprove("thanawat", q.resort, ["siriporn", "hatsanai"]);
    });
    on("2026-05-19", "ส่งใบเสนอราคา ระบบจองห้องพัก", () => sales.sendQuotation("thanawat", q.resort));
    on("2026-05-28", "ลูกค้าตอบรับ ระบบจองห้องพัก", async () => {
        state.projects.resort = await sales.acceptQuotation("thanawat", q.resort);
    });
    on("2026-06-01", "ใบแจ้งหนี้มัดจำ ระบบจองห้องพัก", async () => {
        inv.resort1 = await sales.invoiceMilestone(accountant, q.resort, 0);
    });
    on("2026-06-12", "รับเช็คมัดจำ ระบบจองห้องพัก", async () => {
        const amount = await sales.outstandingOf(accountant, inv.resort1);
        await sales.receivePayment(accountant, {
            clientId: clients.andamanResort, date: "2026-06-12", method: "cheque",
            cheque: { no: "0458721", bank: "ธนาคารกรุงเทพ สาขากระบี่", date: "2026-06-12" },
            invoices: [{ id: inv.resort1, amount }], wht: money(amount * 0.03), whtCertificateNo: "ABR-0612/2569",
        });
    });
    on("2026-08-03", "ใบแจ้งหนี้งวด 2 ระบบจองห้องพัก", async () => {
        inv.resort2 = await sales.invoiceMilestone(accountant, q.resort, 1);
    });
    on("2026-08-21", "รับเงินงวด 2 ระบบจองห้องพัก", async () => {
        const amount = await sales.outstandingOf(accountant, inv.resort2);
        await sales.receivePayment(accountant, {
            clientId: clients.andamanResort, date: "2026-08-21", bankAccountId: bank,
            invoices: [{ id: inv.resort2, amount }], wht: money(amount * 0.03), whtCertificateNo: "ABR-0821/2569",
        });
    });
    on("2026-10-05", "ใบแจ้งหนี้งวด 3 ระบบจองห้องพัก", async () => {
        inv.resort3 = await sales.invoiceMilestone(accountant, q.resort, 2);
    });

    // ── 4) สยามปาล์ม: ระบบคลังสินค้าและรับซื้อผลปาล์ม (ตีกลับให้แก้ส่วนลด · ใบเพิ่มหนี้ · ใบวางบิล)
    const palmItems = (discount) => ({
        qt_client_id: clients.siamPalm,
        qt_title: "ระบบบริหารคลังสินค้าและการรับซื้อผลปาล์มน้ำมัน",
        qt_payment_mode: "milestones",
        qt_valid_days: 60,
        qt_discount_type: "amount",
        qt_discount_value: discount,
        items: [
            sales.heading("วิเคราะห์และออกแบบ"),
            line(product.analysis, 1),
            line(product.uxui, 20),
            sales.heading("พัฒนาระบบ"),
            line(product.webDev, 60, { description: "ระบบรับซื้อผลปาล์ม ชั่งน้ำหนัก คุมคลัง และรายงานผู้บริหาร" }),
            line(product.mobileDev, 20, { description: "แอปมือถือสำหรับจุดรับซื้อ (ทำงานแบบออฟไลน์ได้)" }),
            line(product.testing, 15),
            sales.heading("ติดตั้งและส่งมอบ"),
            line(product.deploy, 1),
            line(product.training, 3, { description: "ฝึกอบรมผู้ใช้งานจุดรับซื้อ 3 จุด" }),
        ],
        milestones: [
            { qtm_name: "มัดจำเมื่อลงนามสัญญา", qtm_percent: "20" },
            { qtm_name: "ส่งมอบระบบรับซื้อและคลังสินค้า (ทดสอบ)", qtm_percent: "30" },
            { qtm_name: "ส่งมอบแอปมือถือและรายงาน", qtm_percent: "30" },
            { qtm_name: "เปิดใช้งานจริงครบ 3 จุดรับซื้อ", qtm_percent: "20" },
        ],
    });
    on("2026-07-06", "ใบเสนอราคา ระบบรับซื้อปาล์ม (ส่งขออนุมัติ)", async () => {
        q.palm = await sales.createQuotation("siriporn", palmItems("20000"));
        await as("siriporn", "POST", `/V1/quotations/${q.palm}/submit`, {});
        await as("hatsanai", "POST", `/V1/quotations/${q.palm}/return`, {
            reason: "ลูกค้าเป็นโรงงานขนาดใหญ่ มีโอกาสขยายงาน ให้ส่วนลด 28,000 เพื่อปิดยอดที่ 500,000 บาท",
        });
    });
    on("2026-07-07", "แก้ส่วนลดแล้วส่งขออนุมัติใหม่ ระบบรับซื้อปาล์ม", async () => {
        const detail = await as("siriporn", "GET", `/V1/quotations/${q.palm}`);
        const version = detail.quotation?.qt_version ?? detail.qt_version;
        await as("siriporn", "PUT", `/V1/quotations/${q.palm}`, { ...palmItems("28000"), qt_branch_id: ids.headOffice, qt_version: version });
        await sales.submitAndApprove("siriporn", q.palm, ["hatsanai", "hatsanai"]);
    });
    on("2026-07-08", "ส่งใบเสนอราคา ระบบรับซื้อปาล์ม", () => sales.sendQuotation("siriporn", q.palm));
    on("2026-07-20", "ลูกค้าตอบรับ ระบบรับซื้อปาล์ม", async () => {
        state.projects.palm = await sales.acceptQuotation("siriporn", q.palm);
    });
    on("2026-07-21", "ใบแจ้งหนี้มัดจำ ระบบรับซื้อปาล์ม", async () => {
        inv.palm1 = await sales.invoiceMilestone(accountant, q.palm, 0);
    });
    on("2026-08-10", "ใบเพิ่มหนี้ หน้ารายงานเพิ่ม", async () => {
        inv.palmDebit = await sales.debitNote(accountant, "hatsanai", {
            inv_reference_invoice_id: inv.palm1,
            inv_adjust_reason_code: "scope_increase",
            inv_adjust_reason: "ลูกค้าขอเพิ่มรายงานสรุปการรับซื้อรายวันแยกตามจุดรับซื้อ (นอกขอบเขตสัญญา)",
            inv_title: "งานเพิ่ม: รายงานสรุปการรับซื้อผลปาล์มรายวัน",
            inv_credit_days: 45,
            inv_wht_rate: "3",
            items: [
                { invi_type: "item", invi_description: "รายงานสรุปการรับซื้อรายวันแยกจุดรับซื้อ พร้อมส่งออก Excel", invi_quantity: "1", invi_unit: "งาน", invi_unit_price: "15000" },
            ],
        });
    });
    on("2026-08-31", "รับเงินมัดจำ + ใบเพิ่มหนี้ ระบบรับซื้อปาล์ม", async () => {
        const deposit = await sales.outstandingOf(accountant, inv.palm1);
        const extra = await sales.outstandingOf(accountant, inv.palmDebit);
        await sales.receivePayment(accountant, {
            clientId: clients.siamPalm, date: "2026-08-31", bankAccountId: bank,
            invoices: [{ id: inv.palm1, amount: deposit }, { id: inv.palmDebit, amount: extra }],
            wht: money((Number(deposit) + Number(extra)) * 0.03), whtCertificateNo: "SPI-WHT-08/0312",
        });
    });
    on("2026-09-21", "ใบแจ้งหนี้งวด 2 ระบบรับซื้อปาล์ม", async () => {
        inv.palm2 = await sales.invoiceMilestone(accountant, q.palm, 1);
    });
    on("2026-09-22", "ใบวางบิล งวด 2 ระบบรับซื้อปาล์ม", async () => {
        state.palmBillingNote = await sales.billingNote(accountant, clients.siamPalm, [inv.palm2], "2026-10-15");
    });
    on("2026-10-15", "รับเงินงวด 2 ตามใบวางบิล", async () => {
        const amount = await sales.outstandingOf(accountant, inv.palm2);
        await sales.receivePayment(accountant, {
            clientId: clients.siamPalm, date: "2026-10-15", bankAccountId: bank, billingNoteId: state.palmBillingNote,
            invoices: [{ id: inv.palm2, amount }], wht: money(amount * 0.03), whtCertificateNo: "SPI-WHT-10/0455",
        });
    });

    // ── 5) Andaman Digital (สิงคโปร์): แอปจองทริปดำน้ำ — สกุลดอลลาร์ อัตราตามสัญญา
    on("2026-08-10", "ใบเสนอราคา USD แอปจองดำน้ำ", async () => {
        q.dive = await sales.createQuotation("siriporn", {
            qt_client_id: clients.andamanDigital,
            qt_title: "Dive Trip Booking Mobile App",
            qt_language: "en",
            qt_currency: "USD",
            qt_exchange_rate: "35.80",
            qt_rate_source: "manual",
            qt_rate_override_reason: "อัตราคงที่ตามสัญญากับลูกค้า (Fixed rate per contract)",
            qt_payment_mode: "milestones",
            items: [
                { qti_type: "heading", qti_description: "Design" },
                { qti_type: "item", qti_description: "UX/UI design for iOS and Android", qti_quantity: "12", qti_unit: "man-day", qti_unit_price: "70" },
                { qti_type: "heading", qti_description: "Development" },
                { qti_type: "item", qti_description: "Mobile app development (React Native)", qti_quantity: "40", qti_unit: "man-day", qti_unit_price: "140" },
                { qti_type: "item", qti_description: "Booking backend API and admin dashboard", qti_quantity: "25", qti_unit: "man-day", qti_unit_price: "130" },
                { qti_type: "note", qti_description: "App store fees and third-party payment gateway fees are excluded." },
            ],
            milestones: [
                { qtm_name: "Deposit upon contract signing", qtm_percent: "40" },
                { qtm_name: "App store release", qtm_percent: "60" },
            ],
        });
        await sales.submitAndApprove("siriporn", q.dive, ["hatsanai", "hatsanai"]);
    });
    on("2026-08-11", "ส่งใบเสนอราคา USD", () => sales.sendQuotation("siriporn", q.dive));
    on("2026-08-24", "ลูกค้าตอบรับ แอปจองดำน้ำ", async () => {
        state.projects.dive = await sales.acceptQuotation("siriporn", q.dive);
    });
    on("2026-08-25", "ใบแจ้งหนี้ USD มัดจำ", async () => {
        inv.dive1 = await sales.invoiceMilestone(accountant, q.dive, 0);
    });
    on("2026-09-08", "รับเงินโอนต่างประเทศ (USD)", async () => {
        const amount = await sales.outstandingOf(accountant, inv.dive1);
        await sales.receivePayment(accountant, {
            clientId: clients.andamanDigital, date: "2026-09-08", bankAccountId: bank, invoices: [{ id: inv.dive1, amount }],
            receivedThb: money(Number(amount) * 35.62 - 350), reference: "SWIFT ADPL-20260908",
        });
    });

    // ── 6) ใบเสนอราคาที่ยังไม่จบ / ไม่ได้งาน
    on("2026-08-17", "ใบเสนอราคา แอปมือถือทัวร์ (ลูกค้าปฏิเสธภายหลัง)", async () => {
        q.tourApp = await sales.createQuotation("thanawat", {
            qt_client_id: clients.krabiHoliday,
            qt_title: "แอปพลิเคชันมือถือสำหรับลูกค้าทัวร์",
            items: [
                line(product.uxui, 14),
                line(product.mobileDev, 35),
                line(product.testing, 8),
                line(product.deploy, 1, { description: "อัปโหลดขึ้น App Store และ Google Play" }),
            ],
        });
        await sales.submitAndApprove("thanawat", q.tourApp, ["siriporn"]);
        await sales.sendQuotation("thanawat", q.tourApp);
    });
    on("2026-09-01", "ลูกค้าปฏิเสธ แอปมือถือทัวร์", async () => {
        await as("thanawat", "POST", `/V1/quotations/${q.tourApp}/decline`, {
            reason: "ลูกค้าแจ้งว่างบประมาณปีนี้ไม่พอ ขอเลื่อนไปพิจารณาต้นปีหน้า",
        });
    });
    on("2026-09-07", "ใบเสนอราคา ระบบสมาชิกคลินิก (ยกเลิกภายหลัง)", async () => {
        q.loyalty = await sales.createQuotation("siriporn", {
            qt_client_id: clients.smileClinic,
            qt_title: "ระบบสมาชิกและแต้มสะสมสำหรับคนไข้",
            items: [line(product.uxui, 4), line(product.webDev, 8)],
        });
        await sales.submitAndApprove("siriporn", q.loyalty, ["hatsanai"]);
        await sales.sendQuotation("siriporn", q.loyalty);
    });
    on("2026-09-21", "ยกเลิกใบเสนอราคา ระบบสมาชิกคลินิก", async () => {
        await as("hatsanai", "POST", `/V1/quotations/${q.loyalty}/cancel`, {
            reason: "ลูกค้าเลือกใช้โปรแกรมสำเร็จรูปของบริษัทยา ยกเลิกความต้องการ",
        });
    });
    on("2026-09-14", "ใบเสนอราคา ระบบติดตามรถขนส่ง (รออนุมัติชั้น 2)", async () => {
        q.fleet = await sales.createQuotation("thanawat", {
            qt_client_id: clients.goldenSea,
            qt_title: "ระบบติดตามรถขนส่งและบริหารเที่ยววิ่ง (GPS Fleet Tracking)",
            qt_payment_mode: "milestones",
            items: [
                line(product.analysis, 1),
                line(product.uxui, 12),
                line(product.webDev, 40, { description: "แดชบอร์ดติดตามรถแบบเรียลไทม์ จัดเที่ยววิ่ง และรายงานน้ำมัน" }),
                line(product.mobileDev, 20, { description: "แอปคนขับ รับงาน ถ่ายรูปหลักฐานการส่ง" }),
                line(product.testing, 12),
                line(product.deploy, 1),
            ],
            milestones: [
                { qtm_name: "มัดจำ", qtm_percent: "30" },
                { qtm_name: "ส่งมอบแดชบอร์ดและแอปคนขับ", qtm_percent: "50" },
                { qtm_name: "เปิดใช้งานจริง", qtm_percent: "20" },
            ],
        });
        await as("thanawat", "POST", `/V1/quotations/${q.fleet}/submit`, {});
    });
    on("2026-09-15", "อนุมัติชั้น 1 ระบบติดตามรถ", () => as("siriporn", "POST", `/V1/quotations/${q.fleet}/approve`, {}));
    on("2026-09-28", "ใบเสนอราคา POS ร้านอาหาร (รอลูกค้าตอบ)", async () => {
        q.pos = await sales.createQuotation("thanawat", {
            qt_client_id: clients.aoNangSeafood,
            qt_title: "ระบบ POS และเมนูออนไลน์สำหรับร้านอาหาร",
            items: [
                line(product.uxui, 6),
                line(product.webDev, 14, { description: "ระบบสั่งอาหารผ่าน QR ที่โต๊ะ ครัว และแคชเชียร์" }),
                line(product.hosting, 1),
                line(product.training, 1),
            ],
        });
        await sales.submitAndApprove("thanawat", q.pos, ["siriporn"]);
    });
    on("2026-09-29", "ส่งใบเสนอราคา POS", () => sales.sendQuotation("thanawat", q.pos));
    on("2026-10-16", "ร่างใบเสนอราคา ปรับปรุงเว็บไซต์", async () => {
        q.website = await sales.createQuotation("thanawat", {
            qt_client_id: clients.goldenSea,
            qt_title: "ปรับปรุงเว็บไซต์บริษัทและระบบขอใบเสนอราคาค่าขนส่ง",
            items: [line(product.uxui, 6), line(product.webDev, 10)],
        });
    });
}

// ═══ โปรเจกต์ ══════════════════════════════════════════════════════════════════════════════
function scheduleProjects(ids, state, user) {
    const position = ids.positions;
    const developer = (username) => ({ userId: user(username), positionIds: [position.developer] });
    const pm = (username) => ({ userId: user(username), positionIds: [position.pm] });

    on("2026-04-28", "ทีมโปรเจกต์ระบบจองทัวร์", async () => {
        const projectId = state.projects.tour;
        await projects.addMembers("thanawat", projectId, [
            pm("nattapon"),
            developer("supawadee"),
            developer("weerayut"),
            developer("piyapong"),
            { userId: user("chonthicha"), positionIds: [position.designer] },
            { userId: user("kittisak"), positionIds: [position.tester] },
        ]);
        await projects.updateProject("nattapon", projectId, {
            project_status: "in_progress", project_start_date: "2026-05-04", project_due_date: "2026-07-31",
        });
        await projects.assignTasks("nattapon", projectId, [[user("chonthicha")], [user("supawadee"), user("weerayut")], [user("nattapon")]]);
        await projects.labelTasks("nattapon", projectId, [
            { name: "Frontend", color: "sky", taskIndexes: [0, 1] },
            { name: "ลูกค้าต้องตรวจรับ", color: "yellow", taskIndexes: [2] },
        ]);
    });
    on("2026-05-04", "โปรเจกต์ภายใน ระบบบริหารงาน", async () => {
        const created = await as("nattapon", "POST", "/V1/projects", {
            project_name: "พัฒนาระบบบริหารงานภายใน Softwork",
            project_description: "ระบบบริหารโปรเจกต์ งานขาย จัดซื้อ และบุคคลที่ใช้ภายในบริษัท (ไม่มีลูกค้า)",
            project_status: "in_progress",
            project_type: "agile",
            project_start_date: "2026-05-04",
            project_due_date: "2026-12-31",
        });
        state.projects.internal = created.project_id;
        await projects.addMembers("nattapon", created.project_id, [developer("piyapong"), developer("apichart")]);
        const tasks = [
            ["ระบบใบเสนอราคาและอนุมัติหลายชั้น", "done"],
            ["ระบบใบแจ้งหนี้ ใบวางบิล และใบเสร็จ", "done"],
            ["ระบบค่าใช้จ่ายและหัก ณ ที่จ่าย", "done"],
            ["ระบบพนักงาน ลงเวลา และการลา", "review"],
            ["ระบบรอบเงินเดือนและแบบ ภ.ง.ด.1", "in_progress"],
            ["บัตรพนักงานและรหัสพนักงานใหม่", "in_progress"],
            ["ระบบใบสั่งซื้อ (PO)", "todo"],
        ];
        for (const [title, status] of tasks) {
            const task = await as("nattapon", "POST", `/V1/projects/${created.project_id}/tasks`, {
                task_title: title,
                assignee_ids: [user("nattapon")],
                task_start_date: "2026-05-04",
            });
            const path = ["in_progress", "review", "done"];
            for (const step of path.slice(0, path.indexOf(status) + 1)) {
                await as("nattapon", "PUT", `/V1/projects/${created.project_id}/tasks/${task.task_id}/status`, { task_status: step });
            }
        }
    });
    on("2026-05-12", "ทีมโปรเจกต์เว็บไซต์คลินิก", async () => {
        const projectId = state.projects.clinic;
        await projects.addMembers("siriporn", projectId, [
            pm("nattapon"),
            developer("piyapong"),
            { userId: user("chonthicha"), positionIds: [position.designer] },
        ]);
        await projects.updateProject("nattapon", projectId, {
            project_status: "in_progress", project_start_date: "2026-05-13", project_due_date: "2026-07-10",
        });
        await projects.assignTasks("nattapon", projectId, [[user("chonthicha")], [user("piyapong")]]);
    });
    on("2026-05-28", "ทีมโปรเจกต์ระบบจองห้องพัก", async () => {
        const projectId = state.projects.resort;
        await projects.addMembers("thanawat", projectId, [
            pm("nattapon"),
            developer("piyapong"),
            developer("weerayut"),
            developer("apichart"),
            { userId: user("chonthicha"), positionIds: [position.designer] },
            { userId: user("kittisak"), positionIds: [position.tester] },
        ]);
        await projects.updateProject("nattapon", projectId, {
            project_status: "in_progress", project_start_date: "2026-06-01", project_due_date: "2026-11-30",
        });
        await projects.assignTasks("nattapon", projectId, [[user("chonthicha")], [user("piyapong"), user("apichart")], [user("nattapon")]]);
        await projects.labelTasks("nattapon", projectId, [
            { name: "Backend", color: "blue", taskIndexes: [1] },
            { name: "ด่วน", color: "red", taskIndexes: [2] },
            { name: "รอลูกค้าตอบ", color: "yellow", taskIndexes: [0] },
        ]);
        await projects.addChecklist("nattapon", projectId, 2, [
            ["ตั้งค่าเซิร์ฟเวอร์จริงและ SSL", true],
            ["ย้ายข้อมูลห้องพักจากระบบเดิม", true],
            ["อบรมพนักงานต้อนรับ", false],
            ["ส่งเอกสารส่งมอบงาน", false],
        ]);
    });
    // ปิดโปรเจกต์วันจันทร์ถัดไป (ลงเวลาของสัปดาห์สุดท้ายส่งวันศุกร์ก่อน)
    on("2026-07-13", "ปิดโปรเจกต์เว็บไซต์คลินิก", async () => {
        await projects.completeAllTasks("nattapon", state.projects.clinic);
        await projects.updateProject("nattapon", state.projects.clinic, { project_status: "completed" });
    });
    on("2026-07-20", "ทีมโปรเจกต์ระบบรับซื้อปาล์ม", async () => {
        const projectId = state.projects.palm;
        await projects.addMembers("siriporn", projectId, [
            pm("nattapon"),
            developer("supawadee"),
            developer("weerayut"),
            { userId: user("kittisak"), positionIds: [position.tester] },
            { userId: user("chonthicha"), positionIds: [position.designer] },
        ]);
        await projects.updateProject("nattapon", projectId, {
            project_status: "in_progress", project_start_date: "2026-07-21", project_due_date: "2027-01-29",
        });
        await projects.assignTasks("nattapon", projectId, [[user("chonthicha"), user("nattapon")], [user("supawadee"), user("weerayut")], [user("nattapon")]]);
        await projects.labelTasks("nattapon", projectId, [{ name: "แอปมือถือ", color: "purple", taskIndexes: [1] }]);
    });
    on("2026-08-03", "ปิดโปรเจกต์ระบบจองทัวร์", async () => {
        await projects.completeAllTasks("nattapon", state.projects.tour);
        await projects.updateProject("nattapon", state.projects.tour, { project_status: "completed" });
    });
    on("2026-08-24", "ทีมโปรเจกต์แอปจองดำน้ำ", async () => {
        const projectId = state.projects.dive;
        await projects.addMembers("siriporn", projectId, [
            pm("nattapon"),
            developer("piyapong"),
            { userId: user("chonthicha"), positionIds: [position.designer] },
        ]);
        await projects.updateProject("nattapon", projectId, {
            project_status: "in_progress", project_start_date: "2026-08-25", project_due_date: "2026-12-18",
        });
        await projects.assignTasks("nattapon", projectId, [[user("chonthicha")], [user("piyapong")]]);
    });
    on(LAST_DAY, "ความคืบหน้างานโปรเจกต์ที่กำลังทำ", async () => {
        await projects.setProgress("nattapon", state.projects.resort, { doneCount: 9, reviewCount: 2, inProgressCount: 2 });
        await projects.setProgress("nattapon", state.projects.palm, { doneCount: 4, reviewCount: 1, inProgressCount: 3 });
        await projects.setProgress("nattapon", state.projects.dive, { doneCount: 2, inProgressCount: 2 });
    });
}

// ═══ จัดซื้อ / ค่าใช้จ่าย ════════════════════════════════════════════════════════════════════
function schedulePurchasing(ids, state) {
    const vendor = ids.vendors;
    const bank = ids.bankAccount;
    const clerk = "kamonchanok";
    const approver = "hatsanai";
    const months = ["05", "06", "07", "08", "09", "10"];
    const thaiMonths = { "05": "พฤษภาคม", "06": "มิถุนายน", "07": "กรกฎาคม", "08": "สิงหาคม", "09": "กันยายน", "10": "ตุลาคม" };
    const electricity = { "05": "2840.50", "06": "3120.75", "07": "3388.20", "08": "3256.40", "09": "3012.90", "10": "2958.60" };
    const firstWorkday = (month) => {
        let date = `2026-${month}-01`;
        while (!isWorkday(date)) date = addDays(date, 1);
        return date;
    };
    const workdayOnOrAfter = (date) => {
        let day = date;
        while (!isWorkday(day)) day = addDays(day, 1);
        return day;
    };

    for (const month of months) {
        const monthName = `${thaiMonths[month]} 2569`;
        const rentDate = firstWorkday(month);
        // ค่าเช่าสำนักงาน (บุคคลธรรมดา หัก 5% · ภ.ง.ด.3)
        on(rentDate, `ค่าเช่าสำนักงาน ${monthName}`, async () => {
            state[`rent-${month}`] = await purchasing.recordBill(clerk, approver, {
                ex_vendor_id: vendor.landlord,
                ex_title: `ค่าเช่าอาคารสำนักงาน ประจำเดือน${monthName}`,
                ex_doc_type: "receipt",
                ex_vendor_doc_no: `R-2569/${month}`,
                ex_vendor_doc_date: rentDate,
                ex_expense_date: rentDate,
                ex_credit_days: 5,
                ex_wht_income_type: "RENT",
                lines: [{ exl_category_id: 6, exl_description: "ค่าเช่าอาคารพาณิชย์ 2 ชั้น เลขที่ 113/3", exl_quantity: "1", exl_unit_price: "15000" }],
            });
        });
        on(workdayOnOrAfter(`2026-${month}-05`), `จ่ายค่าเช่า ${monthName}`, () =>
            purchasing.pay(clerk, { payee: { vendorId: vendor.landlord }, date: workdayOnOrAfter(`2026-${month}-05`), expenseIds: [state[`rent-${month}`]], bankAccountId: bank }),
        );
        // คลาวด์เซิร์ฟเวอร์ (ใบกำกับภาษี) — ตั้งแต่ ก.ค. แยกเครื่องของโปรเจกต์โรงแรม (ต้นทุนโปรเจกต์)
        const cloudDate = workdayOnOrAfter(`2026-${month}-02`);
        on(cloudDate, `ค่าคลาวด์เซิร์ฟเวอร์ ${monthName}`, async () => {
            const lines = [{ exl_category_id: 2, exl_description: "Cloud Server 4 vCPU / 8 GB (ระบบภายในและเว็บลูกค้า)", exl_quantity: "1", exl_unit_price: "2400" }];
            if (month >= "07") {
                lines.push({ exl_category_id: 2, exl_project_id: state.projects.resort, exl_description: "Cloud Server ระบบจองห้องพัก อันดามัน บีช รีสอร์ท", exl_quantity: "1", exl_unit_price: "1200" });
            }
            const subtotal = lines.reduce((sum, line) => sum + Number(line.exl_unit_price), 0);
            state[`cloud-${month}`] = await purchasing.recordBill(clerk, approver, {
                ex_vendor_id: vendor.cloudHost,
                ex_title: `ค่าบริการคลาวด์เซิร์ฟเวอร์ ${monthName}`,
                ex_doc_type: "tax_invoice",
                ex_vendor_doc_no: `CH${month}-26-08812`,
                ex_vendor_doc_date: cloudDate,
                ex_expense_date: cloudDate,
                ex_credit_days: 0,
                ex_vat_amount: money(subtotal * 0.07),
                ex_wht_income_type: "SERVICE",
                lines,
            });
            await purchasing.pay(clerk, { payee: { vendorId: vendor.cloudHost }, date: cloudDate, expenseIds: [state[`cloud-${month}`]], bankAccountId: bank, reference: "ตัดบัตร/โอนอัตโนมัติ" });
        });
        // ค่าอินเทอร์เน็ต (ต่ำกว่า 3,000 อนุมัติอัตโนมัติ)
        const internetDate = workdayOnOrAfter(`2026-${month}-10`);
        on(internetDate, `ค่าอินเทอร์เน็ต ${monthName}`, async () => {
            state[`internet-${month}`] = await purchasing.recordBill(clerk, approver, {
                ex_vendor_id: vendor.andamanNet,
                ex_title: `ค่าอินเทอร์เน็ตไฟเบอร์ 1 Gbps ${monthName}`,
                ex_doc_type: "tax_invoice",
                ex_vendor_doc_no: `AN-${month}26-${3310 + Number(month)}`,
                ex_vendor_doc_date: internetDate,
                ex_expense_date: internetDate,
                ex_credit_days: 15,
                ex_vat_amount: "83.30",
                lines: [{ exl_category_id: 7, exl_description: "อินเทอร์เน็ตไฟเบอร์ 1 Gbps + IP คงที่", exl_quantity: "1", exl_unit_price: "1190" }],
            });
        });
        if (month !== "10") {
            const internetPaid = workdayOnOrAfter(`2026-${month}-20`);
            on(internetPaid, `จ่ายค่าอินเทอร์เน็ต ${monthName}`, () =>
                purchasing.pay(clerk, { payee: { vendorId: vendor.andamanNet }, date: internetPaid, expenseIds: [state[`internet-${month}`]], bankAccountId: bank }),
            );
        }
        // ค่าไฟฟ้า (บางเดือนเกิน 3,000 ต้องอนุมัติ) จ่ายวันเดียวกัน
        const powerDate = workdayOnOrAfter(`2026-${month}-12`);
        on(powerDate, `ค่าไฟฟ้า ${monthName}`, async () => {
            const expenseId = await purchasing.recordBill(clerk, approver, {
                ex_vendor_id: vendor.pea,
                ex_title: `ค่าไฟฟ้าสำนักงาน ${monthName}`,
                ex_doc_type: "receipt",
                ex_vendor_doc_no: `PEA-${month}-0042187`,
                ex_vendor_doc_date: powerDate,
                ex_expense_date: powerDate,
                ex_credit_days: 0,
                lines: [{ exl_category_id: 7, exl_description: "ค่าไฟฟ้า มิเตอร์ 020118844", exl_quantity: "1", exl_unit_price: electricity[month] }],
            });
            await purchasing.pay(clerk, { payee: { vendorId: vendor.pea }, date: powerDate, expenseIds: [expenseId], bankAccountId: bank, reference: "ชำระผ่านแอปธนาคาร" });
        });
        // สำนักงานบัญชี (ตั้งแต่ มิ.ย. · หัก 3% วิชาชีพ)
        if (month >= "06") {
            const accountingDate = workdayOnOrAfter(`2026-${month}-05`);
            on(accountingDate, `ค่าทำบัญชี ${monthName}`, async () => {
                state[`accounting-${month}`] = await purchasing.recordBill(clerk, approver, {
                    ex_vendor_id: vendor.accountingFirm,
                    ex_title: `ค่าทำบัญชีและยื่นภาษีประจำเดือน${monthName}`,
                    ex_doc_type: "receipt",
                    ex_vendor_doc_no: `KA-${month}/2569`,
                    ex_vendor_doc_date: accountingDate,
                    ex_expense_date: accountingDate,
                    ex_credit_days: 15,
                    ex_wht_income_type: "PROFESSIONAL",
                    lines: [{ exl_category_id: 12, exl_description: "ทำบัญชี ยื่น ภ.พ./ภ.ง.ด. และประกันสังคม", exl_quantity: "1", exl_unit_price: "3500" }],
                });
            });
            if (month !== "10") {
                const accountingPaid = workdayOnOrAfter(`2026-${month}-15`);
                on(accountingPaid, `จ่ายค่าทำบัญชี ${monthName}`, () =>
                    purchasing.pay(clerk, { payee: { vendorId: vendor.accountingFirm }, date: accountingPaid, expenseIds: [state[`accounting-${month}`]], bankAccountId: bank }),
                );
            }
        }
    }

    // ── ซื้อครั้งคราว
    on("2026-05-06", "ซื้อโน้ตบุ๊กและจอ (ทรัพย์สิน)", async () => {
        state.laptops = await purchasing.recordBill(clerk, approver, {
            ex_vendor_id: vendor.itShop,
            ex_title: "โน้ตบุ๊กสำหรับนักพัฒนาใหม่ และจอแสดงผล",
            ex_doc_type: "tax_invoice",
            ex_vendor_doc_no: "KIT-IV2605-0193",
            ex_vendor_doc_date: "2026-05-06",
            ex_expense_date: "2026-05-06",
            ex_credit_days: 30,
            ex_vat_amount: money((32900 + 2 * 5490) * 0.07),
            lines: [
                { exl_category_id: 11, exl_description: "โน้ตบุ๊ก Lenovo ThinkPad E14 (Core i7 / RAM 16 GB / SSD 512 GB)", exl_quantity: "1", exl_unit_price: "32900" },
                { exl_category_id: 11, exl_description: "จอมอนิเตอร์ Dell 24 นิ้ว", exl_quantity: "2", exl_unit_price: "5490" },
            ],
        });
    });
    on("2026-06-05", "จ่ายค่าโน้ตบุ๊ก", () =>
        purchasing.pay(clerk, { payee: { vendorId: vendor.itShop }, date: "2026-06-05", expenseIds: [state.laptops], bankAccountId: bank }),
    );
    on("2026-07-08", "จ้างฟรีแลนซ์วาดภาพประกอบ (โปรเจกต์โรงแรม)", async () => {
        state.illustration = await purchasing.recordBill(clerk, approver, {
            ex_vendor_id: vendor.freelanceDesigner,
            ex_title: "ภาพประกอบและไอคอนห้องพัก ระบบจองห้องพัก",
            ex_doc_type: "substitute_receipt",
            ex_expense_date: "2026-07-08",
            ex_credit_days: 7,
            ex_wht_income_type: "SERVICE",
            lines: [{ exl_category_id: 1, exl_project_id: state.projects.resort, exl_description: "ภาพประกอบห้องพัก 12 แบบ และชุดไอคอนสิ่งอำนวยความสะดวก", exl_quantity: "1", exl_unit_price: "12000" }],
        });
    });
    on("2026-07-15", "จ่ายฟรีแลนซ์ (หัก 3%)", () =>
        purchasing.pay(clerk, { payee: { vendorId: vendor.freelanceDesigner }, date: "2026-07-15", expenseIds: [state.illustration], bankAccountId: bank }),
    );
    on("2026-09-14", "ซื้อคีย์บอร์ดและเมาส์", async () => {
        state.peripherals = await purchasing.recordBill(clerk, approver, {
            ex_vendor_id: vendor.itShop,
            ex_title: "คีย์บอร์ดและเมาส์ไร้สายสำหรับห้องประชุม",
            ex_doc_type: "tax_invoice",
            ex_vendor_doc_no: "KIT-IV2609-0877",
            ex_vendor_doc_date: "2026-09-14",
            ex_expense_date: "2026-09-14",
            ex_credit_days: 30,
            ex_vat_amount: money(2450 * 0.07),
            lines: [{ exl_category_id: 10, exl_description: "ชุดคีย์บอร์ดและเมาส์ไร้สาย Logitech MK295", exl_quantity: "2", exl_unit_price: "1225" }],
        });
    });

    // ── ใบเบิกเงินพนักงาน (ผู้รับเงินคืน = บัญชีผู้ใช้ของคนเบิก)
    const claimant = ids.users;
    on("2026-06-11", "เบิกค่ารับรองลูกค้าโรงแรม", async () => {
        state.claimMeal = await purchasing.recordClaim("nattapon", "kamonchanok", {
            ex_title: "ค่ารับรองลูกค้า ประชุมสรุปความต้องการระบบจองห้องพัก",
            ex_merchant_name: "ร้านอาหารอ่าวนาง ซีฟู้ด กริลล์",
            shop: "Ao Nang Seafood Grill",
            ex_doc_type: "receipt",
            ex_vendor_doc_no: "AN-55821",
            ex_vendor_doc_date: "2026-06-11",
            ex_expense_date: "2026-06-11",
            lines: [{ exl_category_id: 9, exl_project_id: state.projects.resort, exl_description: "อาหารกลางวันประชุมกับผู้จัดการรีสอร์ท 4 ท่าน", exl_quantity: "1", exl_unit_price: "1240" }],
        });
    });
    on("2026-06-15", "จ่ายคืนพนักงาน ค่ารับรอง", () =>
        purchasing.pay(clerk, { payee: { employeeId: claimant.nattapon }, date: "2026-06-15", expenseIds: [state.claimMeal], bankAccountId: bank }),
    );
    on("2026-08-27", "เบิกค่าเดินทางไปพบลูกค้าภูเก็ต", async () => {
        state.claimTrip = await purchasing.recordClaim("thanawat", "kamonchanok", {
            ex_title: "ค่าเดินทางนำเสนอระบบติดตามรถ ลูกค้าที่ภูเก็ต",
            ex_merchant_name: "ค่าทางด่วน/รถรับจ้าง และที่พัก",
            ex_doc_type: "substitute_receipt",
            ex_expense_date: "2026-08-27",
            ex_notes: "เดินทาง 27–28 ส.ค. พบคุณปกรณ์ บริษัท โกลเด้นซี โลจิสติกส์",
            lines: [
                { exl_category_id: 8, exl_description: "ค่าที่พัก 1 คืน ภูเก็ต", exl_quantity: "1", exl_unit_price: "1200" },
                { exl_category_id: 8, exl_description: "ค่ารถรับจ้างในตัวเมืองภูเก็ต", exl_quantity: "1", exl_unit_price: "650" },
            ],
        });
    });
    on("2026-08-31", "จ่ายคืนพนักงาน ค่าเดินทาง", () =>
        purchasing.pay(clerk, { payee: { employeeId: claimant.thanawat }, date: "2026-08-31", expenseIds: [state.claimTrip], bankAccountId: bank }),
    );
    on("2026-09-30", "เบิกค่าเครื่องเขียนทีมออกแบบ", async () => {
        state.claimSupplies = await purchasing.recordClaim("chonthicha", "kamonchanok", {
            ex_title: "ค่าอุปกรณ์เขียนแบบและกระดาษ Post-it สำหรับเวิร์กช็อปออกแบบ",
            ex_merchant_name: "ร้านเครื่องเขียน ออฟฟิศเมท กระบี่",
            shop: "OfficeMate Krabi",
            ex_doc_type: "abbreviated_tax_invoice",
            ex_vendor_doc_no: "OM-KBV-118204",
            ex_vendor_doc_date: "2026-09-30",
            ex_expense_date: "2026-09-30",
            lines: [{ exl_category_id: 10, exl_description: "ปากกาเมจิก Post-it และกระดาษฟลิปชาร์ต", exl_quantity: "1", exl_unit_price: "640" }],
        });
    });
    on("2026-10-05", "จ่ายคืนพนักงาน ค่าเครื่องเขียน", () =>
        purchasing.pay(clerk, { payee: { employeeId: claimant.chonthicha }, date: "2026-10-05", expenseIds: [state.claimSupplies], bankAccountId: bank }),
    );
    on("2026-10-14", "เบิกค่ารถไปติดตั้งระบบที่โรงงาน (ยังไม่จ่าย)", async () => {
        await purchasing.recordClaim("kittisak", "kamonchanok", {
            ex_title: "ค่ารถรับจ้างไปทดสอบระบบที่จุดรับซื้อปาล์ม คลองท่อม",
            ex_merchant_name: "รถรับจ้างไม่มีใบเสร็จ",
            ex_doc_type: "substitute_receipt",
            ex_expense_date: "2026-10-14",
            lines: [{ exl_category_id: 8, exl_project_id: state.projects.palm, exl_description: "ค่ารถไป-กลับ สำนักงาน–โรงงานสยามปาล์ม", exl_quantity: "1", exl_unit_price: "380" }],
        });
    });
}

// ═══ บุคคล: พนักงานเข้า-ออก บัตร การลา รอบเงินเดือน ═════════════════════════════════════════════
function schedulePeople(ids, state) {
    const hr = "wannipa";
    const remember = (username, start, end = start, hours = 8) => {
        for (let day = start; day <= end; day = addDays(day, 1)) {
            if (!state.leaveDays.has(username)) state.leaveDays.set(username, new Map());
            state.leaveDays.get(username).set(day, hours);
        }
    };

    on("2026-05-04", "พิมพ์บัตรพนักงานชุดแรก", () => people.printPendingCards(hr));
    on("2026-05-25", "รับพนักงานใหม่ อภิชาติ (เริ่ม 1 มิ.ย.)", async () => {
        await addEmployee(data.EMPLOYEES.find((employee) => employee.key === "apichart"), ids);
    });
    on("2026-06-01", "พิมพ์บัตรพนักงานใหม่", () => people.printPendingCards(hr));
    on("2026-08-20", "เปิดสาขาภูเก็ต + แผนกขายสาขา", async () => {
        ids.branches = { ...ids.branches, phuket: (await as("admin", "POST", "/V1/company/branches", data.PHUKET_BRANCH)).branch_id };
        for (const [abbr, name] of Object.entries(data.PHUKET_DEPARTMENTS)) {
            const department = await as("admin", "POST", "/V1/departments", { dep_name: name, dep_branch_id: ids.branches.phuket, dep_abbr: abbr });
            ids.departments[abbr] = department.dep_id;
        }
    });
    on("2026-08-25", "รับพนักงานขายสาขาภูเก็ต ปวีณา (เริ่ม 1 ก.ย.)", async () => {
        await addEmployee(data.EMPLOYEES.find((employee) => employee.key === "pawinee"), ids);
    });
    on("2026-09-01", "พิมพ์บัตรพนักงานสาขาภูเก็ต", () => people.printPendingCards(hr));

    // การลา
    const leaves = [
        { filed: "2026-06-17", employee: "piyapong", approver: "nattapon", typeId: LEAVE.sick, start: "2026-06-16", reason: "เป็นไข้หวัด พักผ่อนที่บ้าน" },
        { filed: "2026-07-13", employee: "supawadee", approver: "nattapon", typeId: LEAVE.personal, start: "2026-07-17", reason: "พาคุณแม่ไปตรวจสุขภาพที่โรงพยาบาลกระบี่" },
        { filed: "2026-08-03", employee: "siriporn", approver: "hatsanai", typeId: LEAVE.personal, start: "2026-08-13", end: "2026-08-14", reason: "พาครอบครัวไปงานบวชน้องชายที่นครศรีธรรมราช" },
        { filed: "2026-08-17", employee: "weerayut", approver: "nattapon", typeId: LEAVE.personal, start: "2026-08-24", end: "2026-08-25", reason: "ไปสัมภาษณ์และสอบเข้าเรียนปริญญาโท" },
        { filed: "2026-09-08", employee: "kamonchanok", approver: "wannipa", typeId: LEAVE.sick, start: "2026-09-08", halfDay: "morning", reason: "ไปพบทันตแพทย์ช่วงเช้า" },
        {
            filed: "2026-09-17", employee: "supawadee", approver: "nattapon", typeId: LEAVE.sick, start: "2026-09-14", end: "2026-09-16",
            reason: "ไข้เลือดออก แพทย์ให้พักรักษาตัว 3 วัน", medicalCertificate: true,
        },
        { filed: "2026-09-23", employee: "kittisak", approver: "nattapon", typeId: LEAVE.sick, start: "2026-09-21", end: "2026-09-22", reason: "ท้องเสีย พักรักษาตัว" },
        { filed: "2026-10-15", employee: "chonthicha", approver: null, typeId: LEAVE.personal, start: "2026-10-26", end: "2026-10-27", reason: "เดินทางไปงานแต่งงานพี่สาวที่เชียงใหม่" },
        { filed: "2026-10-16", employee: "thanawat", approver: null, typeId: LEAVE.personal, start: "2026-10-30", reason: "ติดต่อราชการเรื่องทะเบียนบ้าน" },
    ];
    for (const request of leaves) {
        if (request.approver) remember(request.employee, request.start, request.end ?? request.start, request.halfDay && request.halfDay !== "none" ? 4 : 8);
        on(request.filed, `ขอลา ${request.employee}`, () => people.leave(request));
    }

    // พนักงานลาออก: แจ้งล่วงหน้า · ปิดการเข้าระบบหลังวันสุดท้าย · เก็บบัตรคืน
    const leaver = data.EMPLOYEES.find((employee) => employee.leaves);
    on("2026-08-14", "ตั้งพ้นสภาพ วีรยุทธ (ลาออก)", () =>
        as(hr, "POST", `/V1/employees/${ids.employees[leaver.key]}/terminate`, {
            emp_termination_date: leaver.leaves.lastDay,
            emp_termination_reason: leaver.leaves.reason,
            emp_close_login_on_termination: true,
        }),
    );
    on("2026-09-01", "เก็บบัตรพนักงานคืน", async () => {
        const queue = await as(hr, "GET", "/V1/employee-cards?kind=not_returned");
        for (const card of queue.data.filter((item) => item.ec_employee_id === ids.employees[leaver.key])) {
            await as(hr, "POST", `/V1/employees/${card.ec_employee_id}/cards/${card.ec_id}/returned`, {});
        }
    });
    // บัตรหาย ออกใบใหม่
    on("2026-08-20", "กิตติศักดิ์ทำบัตรหาย ออกใหม่", () =>
        as(hr, "POST", `/V1/employees/${ids.employees.kittisak}/cards`, { ec_reason: "lost", ec_note: "แจ้งบัตรหายระหว่างเดินทางไปพบลูกค้า" }),
    );
    on("2026-08-21", "พิมพ์บัตรใบใหม่", () => people.printPendingCards(hr));

    // รอบเงินเดือน: บริษัทจ่ายเงินเดือนของเดือนไหนวันที่ 5 ของเดือนถัดไป (เลื่อนเป็นวันทำงาน)
    // อนุมัติรอบ = ปิดการลงเวลาของเดือนนั้นทุกสัปดาห์ที่คร่อมเดือน → ต้องอนุมัติหลังสัปดาห์คร่อมเดือนส่งลงเวลาครบแล้ว
    // พ.ค.–ก.ย. จ่ายแล้ว · ต.ค. ร่าง (ยังไม่ถึงวันจ่าย 5 พ.ย.)
    const payrolls = [
        ["2026-05", "2026-06-05"],
        ["2026-06", "2026-07-06"],
        ["2026-07", "2026-08-05"],
        ["2026-08", "2026-09-07"],
        ["2026-09", "2026-10-05"],
    ];
    for (const [period, payDate] of payrolls) {
        on(payDate, `รอบเงินเดือน ${period}`, () =>
            people.payrollMonth({ hr, approver: "hatsanai", payer: hr, period, payDate, paidDate: payDate }),
        );
    }
    on(LAST_DAY, "รอบเงินเดือน ต.ค. (ร่าง)", () =>
        people.payrollMonth({ hr, approver: "hatsanai", payer: hr, period: "2026-10", payDate: "2026-11-05" }),
    );
}

// ═══ ลงเวลา: ทุกสัปดาห์ส่งวันศุกร์ หัวหน้าอนุมัติ (สัปดาห์สุดท้ายบางคนยังรออนุมัติ) ═══════════════════════
function scheduleTimesheets(state) {
    // ช่วงเวลาที่แต่ละคนทำโปรเจกต์ไหน (วันแรก, วันสุดท้าย, โปรเจกต์, รายละเอียดงาน)
    const schedule = {
        nattapon: [
            ["2026-05-04", "2026-05-27", "internal", "พัฒนาระบบบริหารงานภายใน"],
            ["2026-05-28", "2026-07-19", "resort", "ออกแบบสถาปัตยกรรมและรีวิวโค้ด ระบบจองห้องพัก"],
            ["2026-07-20", "2026-10-23", "palm", "วิเคราะห์ระบบรับซื้อปาล์มและดูแลทีม"],
        ],
        piyapong: [
            ["2026-05-04", "2026-05-12", "tour", "พัฒนาระบบจองทัวร์"],
            ["2026-05-13", "2026-07-10", "clinic", "พัฒนาเว็บไซต์คลินิกและระบบนัดหมาย"],
            ["2026-07-13", "2026-08-21", "resort", "พัฒนา API การจองห้องพัก"],
            ["2026-08-24", "2026-10-23", "dive", "พัฒนาแอปจองทริปดำน้ำ"],
        ],
        supawadee: [
            ["2026-05-04", "2026-07-31", "tour", "พัฒนาระบบจองทัวร์และหน้าชำระเงิน"],
            ["2026-08-03", "2026-10-23", "palm", "พัฒนาระบบชั่งน้ำหนักและคลังสินค้า"],
        ],
        weerayut: [
            ["2026-05-04", "2026-05-27", "tour", "พัฒนาระบบหลังบ้านจัดการทัวร์"],
            ["2026-05-28", "2026-07-17", "resort", "พัฒนาระบบหลังบ้านโรงแรม"],
            // วันสุดท้ายจริง 31 ส.ค. (จันทร์) เป็นวันส่งมอบงาน ไม่ได้ลงเวลา — หลังวันนั้นเข้าระบบไม่ได้แล้ว
            ["2026-07-20", "2026-08-28", "palm", "พัฒนาโมดูลรับซื้อผลปาล์ม"],
        ],
        apichart: [["2026-06-01", "2026-10-23", "resort", "พัฒนาระบบเช็กอินและแม่บ้าน"]],
        chonthicha: [
            ["2026-05-04", "2026-05-12", "tour", "ออกแบบหน้าจอระบบจองทัวร์"],
            ["2026-05-13", "2026-05-29", "clinic", "ออกแบบเว็บไซต์คลินิก"],
            ["2026-06-01", "2026-08-21", "resort", "ออกแบบหน้าจอระบบจองห้องพัก"],
            ["2026-08-24", "2026-09-30", "dive", "ออกแบบแอปจองดำน้ำ"],
            ["2026-10-01", "2026-10-23", "palm", "ออกแบบหน้าจอแอปจุดรับซื้อ"],
        ],
        kittisak: [
            ["2026-05-04", "2026-07-31", "tour", "ทดสอบระบบจองทัวร์"],
            ["2026-08-03", "2026-09-30", "resort", "ทดสอบระบบจองห้องพัก"],
            ["2026-10-01", "2026-10-23", "palm", "ทดสอบระบบรับซื้อผลปาล์ม"],
        ],
    };
    const approverOf = (username) => (username === "nattapon" ? "hatsanai" : "nattapon");
    // สัปดาห์สุดท้าย: ส่งแล้วแต่หัวหน้ายังไม่อนุมัติ
    const pendingLastWeek = new Set(["supawadee", "kittisak", "apichart"]);

    for (let monday = "2026-05-04"; monday <= "2026-10-19"; monday = addDays(monday, 7)) {
        const friday = addDays(monday, 4);
        on(friday, `ลงเวลาสัปดาห์ ${monday}`, async () => {
            for (const [username, periods] of Object.entries(schedule)) {
                const entries = [];
                for (let offset = 0; offset < 5; offset++) {
                    const day = addDays(monday, offset);
                    if (!isWorkday(day)) continue;
                    const period = periods.find(([from, to]) => day >= from && day <= to);
                    if (!period) continue;
                    // ขาดงาน (ไม่ลา ไม่มา) ไม่มีชั่วโมงทำงานให้ลง
                    if (state.absentDays?.has(`${username}|${day}`)) continue;
                    const leaveHours = state.leaveDays.get(username)?.get(day) ?? 0;
                    const hours = 8 - leaveHours;
                    if (hours <= 0) continue;
                    entries.push({
                        tse_date: day,
                        tse_project_id: state.projects[period[2]],
                        tse_hours: String(hours),
                        tse_note: period[3],
                    });
                }
                if (entries.length === 0) continue;
                const isLastWeek = monday === "2026-10-19";
                await people.timesheetWeek({
                    employee: username,
                    approver: isLastWeek && pendingLastWeek.has(username) ? null : approverOf(username),
                    monday,
                    entries,
                });
            }
        });
    }
}

module.exports = { runTimeline };
