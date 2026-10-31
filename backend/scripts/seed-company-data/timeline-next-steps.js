// เหตุการณ์ปลาย ต.ค. ให้ "ต่อไปต้องทำ" มีครบทุกสถานการณ์ (2026-10-31 · docs/plans/2026-10-31-project-next-steps.md ขั้น N-4)
// ชุดบริษัท: เลยกำหนด (งาน) · ใบเสนอราคารอตอบในโปรเจกต์เดิม · ยังไม่ออกใบมัดจำ · งานครบแต่ยังไม่ออกใบงวดสุดท้าย
//           ค่าใช้จ่ายรออนุมัติ · ยังไม่แบ่งงาน · พักโปรเจกต์ · งานภายในครบ พร้อมปิด
// ยิงผ่าน API จริงทั้งหมด (เลขเอกสาร การอนุมัติ ยอดเงิน ถูกตามกติกา) · ค่าที่ผูกกับวันที่ = เวลาในนาฬิกาจำลอง
const { as } = require("./api");
const sales = require("./sales");
const purchasing = require("./purchasing");
const projects = require("./projects");

const dateOnly = (value) => (value ? String(value).slice(0, 10) : null);

/** ตั้งวันครบของงานลำดับที่ taskIndex (งานหลักตามลำดับบนบอร์ด) โดยไม่เปลี่ยนค่าอื่น */
async function setTaskDue(owner, projectId, taskIndex, dueDate) {
    const tasks = await projects.listTasks(owner, projectId);
    const task = tasks.filter((item) => !item.task_parent_id && item.task_status !== "done")[taskIndex];
    const detail = await as(owner, "GET", `/V1/projects/${projectId}/tasks/${task.task_id}`);
    await as(owner, "PUT", `/V1/projects/${projectId}/tasks/${task.task_id}`, {
        task_title: detail.task_title,
        task_description: detail.task_description,
        assignee_ids: (detail.assignees ?? []).map((assignee) => assignee.user_id),
        task_start_date: dateOnly(detail.task_start_date),
        task_due_date: dueDate,
        task_weight: detail.task_weight,
    });
}

function scheduleNextStepScenarios({ on, ids, state, lastDay }) {
    const product = ids.products;
    const line = sales.productLine;
    const clients = ids.clients;
    const q = state.quotations;
    const accountant = "kamonchanok";
    const bank = ids.bankAccount;

    // ── งานครบแล้ว ยังไม่ออกใบงวดสุดท้าย: เว็บไซต์ร้านอาหาร (มัดจำรับแล้ว)
    on("2026-10-01", "ใบเสนอราคา เว็บไซต์ร้านอาหาร", async () => {
        q.seafoodSite = await sales.createQuotation("thanawat", {
            qt_client_id: clients.aoNangSeafood,
            qt_title: "เว็บไซต์ร้านอาหารพร้อมเมนูออนไลน์",
            qt_payment_mode: "milestones",
            items: [
                line(product.uxui, 3),
                line(product.webDev, 4, { description: "เว็บไซต์ 4 หน้า พร้อมเมนูและแผนที่ร้าน" }),
            ],
            milestones: [
                { qtm_name: "มัดจำ", qtm_percent: "50" },
                { qtm_name: "ส่งมอบเว็บไซต์", qtm_percent: "50" },
            ],
        });
        await sales.submitAndApprove("thanawat", q.seafoodSite, ["siriporn", "hatsanai"]);
        await sales.sendQuotation("thanawat", q.seafoodSite);
    });
    on("2026-10-02", "ลูกค้าตอบรับ เว็บไซต์ร้านอาหาร", async () => {
        state.projects.seafoodSite = await sales.acceptQuotation("thanawat", q.seafoodSite);
        state.invoices.seafoodDeposit = await sales.invoiceMilestone(accountant, q.seafoodSite, 0);
    });
    on("2026-10-06", "รับเงินมัดจำ เว็บไซต์ร้านอาหาร", async () => {
        const amount = await sales.outstandingOf(accountant, state.invoices.seafoodDeposit);
        await sales.receivePayment(accountant, {
            clientId: clients.aoNangSeafood,
            date: "2026-10-06",
            bankAccountId: bank,
            invoices: [{ id: state.invoices.seafoodDeposit, amount }],
            reference: "SCB 06/10 14:05",
        });
    });
    on("2026-10-22", "งานเว็บไซต์ร้านอาหารเสร็จครบ (รอออกใบงวดสุดท้าย)", () =>
        projects.completeAllTasks("thanawat", state.projects.seafoodSite),
    );

    // ── ลูกค้าตอบรับแล้ว ยังไม่ออกใบมัดจำ: ระบบสั่งซื้อวัตถุดิบ
    on("2026-10-19", "ใบเสนอราคา ระบบสั่งซื้อวัตถุดิบ", async () => {
        q.supply = await sales.createQuotation("siriporn", {
            qt_client_id: clients.goldenSea,
            qt_title: "ระบบสั่งซื้อวัตถุดิบและติดตามสต็อกสาขา",
            qt_payment_mode: "milestones",
            items: [line(product.analysis, 3), line(product.webDev, 15), line(product.testing, 3)],
            milestones: [
                { qtm_name: "มัดจำ", qtm_percent: "40" },
                { qtm_name: "ส่งมอบระบบ", qtm_percent: "40" },
                { qtm_name: "หลังใช้งานจริง 30 วัน", qtm_percent: "20" },
            ],
        });
        await sales.submitAndApprove("siriporn", q.supply, ["hatsanai"]);
        await sales.sendQuotation("siriporn", q.supply);
    });
    on("2026-10-22", "ลูกค้าตอบรับ ระบบสั่งซื้อวัตถุดิบ (ยังไม่ออกใบมัดจำ)", async () => {
        state.projects.supply = await sales.acceptQuotation("siriporn", q.supply);
    });

    // ── ใบเสนอราคางานต่อยอดของโปรเจกต์เดิม ส่งแล้ว รอลูกค้าตอบ
    on("2026-10-20", "ใบเสนอราคาต่อยอด ระบบสมาชิกของรีสอร์ท", async () => {
        q.resortMember = await sales.createQuotation("thanawat", {
            qt_client_id: clients.andamanResort,
            qt_project_id: state.projects.resort,
            qt_title: "ต่อยอดระบบจองห้องพัก: ระบบสมาชิกและแต้มสะสม",
            items: [line(product.uxui, 2), line(product.webDev, 6)],
        });
        await sales.submitAndApprove("thanawat", q.resortMember, ["siriporn", "hatsanai"]);
        await sales.sendQuotation("thanawat", q.resortMember);
    });

    // ── ค่าใช้จ่ายของโปรเจกต์ รออนุมัติ (ยอดเกินวงเงินอนุมัติอัตโนมัติ)
    on("2026-10-21", "บิลค่าทดสอบระบบบนมือถือจริง (รออนุมัติ)", async () => {
        await purchasing.recordBill(accountant, null, {
            ex_vendor_id: ids.vendors.cloudHost,
            ex_title: "ค่าเช่าอุปกรณ์ทดสอบแอปบนมือถือจริง 1 เดือน",
            ex_doc_type: "tax_invoice",
            ex_vendor_doc_no: "CH10-26-09931",
            ex_vendor_doc_date: "2026-10-21",
            ex_expense_date: "2026-10-21",
            ex_credit_days: 15,
            lines: [
                {
                    exl_category_id: 2,
                    exl_project_id: state.projects.palm,
                    exl_description: "Device farm ทดสอบแอปรับซื้อปาล์ม 12 รุ่น",
                    exl_quantity: "1",
                    exl_unit_price: "18500",
                },
            ],
        });
    });

    // ── โปรเจกต์ภายใน: ยังไม่แบ่งงาน · งานครบพร้อมปิด
    on("2026-10-21", "โปรเจกต์ภายใน ปรับปรุงเว็บไซต์บริษัท (ยังไม่แบ่งงาน)", async () => {
        const created = await as("nattapon", "POST", "/V1/projects", {
            project_name: "ปรับปรุงเว็บไซต์บริษัท Softwork",
            project_description: "หน้าผลงานและหน้ารับสมัครงานใหม่ (งานภายใน)",
            project_status: "planning",
            project_start_date: "2026-11-02",
        });
        state.projects.companySite = created.project_id;
    });
    on("2026-10-12", "โปรเจกต์ภายใน ย้ายอีเมลบริษัท", async () => {
        const created = await as("nattapon", "POST", "/V1/projects", {
            project_name: "ย้ายอีเมลบริษัทไประบบใหม่",
            project_description: "ย้ายกล่องอีเมลพนักงานและตั้งค่า SPF/DKIM (งานภายใน)",
            project_status: "in_progress",
            project_start_date: "2026-10-12",
            tasks: [
                { type: "item", description: "ย้ายกล่องอีเมลพนักงานทั้งหมด" },
                { type: "item", description: "ตั้งค่า SPF/DKIM และทดสอบส่งออก" },
            ],
        });
        state.projects.mailMove = created.project_id;
    });
    on("2026-10-20", "ย้ายอีเมลเสร็จครบ (ยังไม่ปิดโปรเจกต์)", () =>
        projects.completeAllTasks("nattapon", state.projects.mailMove),
    );

    // ── พักโปรเจกต์: ลูกค้าขอเลื่อน
    on("2026-10-15", "พักโปรเจกต์ แอปตรวจนับสต็อกอะไหล่ (ลูกค้าขอเลื่อน)", async () => {
        const created = await as("nattapon", "POST", "/V1/projects", {
            project_name: "แอปตรวจนับสต็อกอะไหล่ (รอลูกค้ายืนยันขอบเขต)",
            client_id: clients.siamPalm,
            project_description: "ลูกค้าขอพักไว้จนกว่าจะสรุปจำนวนสาขา",
            project_status: "on_hold",
            project_start_date: "2026-10-15",
            tasks: [{ type: "item", description: "สรุปขอบเขตและจำนวนสาขากับลูกค้า" }],
        });
        state.projects.partsOnHold = created.project_id;
    });

    // ── โปรเจกต์เลยกำหนดส่ง งานยังไม่ครบ: อบรมทีมใช้ระบบใหม่ (งานภายใน)
    on("2026-10-01", "โปรเจกต์ภายใน อบรมทีมใช้ระบบใหม่ (เลยกำหนด)", async () => {
        await as("nattapon", "POST", "/V1/projects", {
            project_name: "อบรมทีมใช้ระบบบริหารงานใหม่",
            project_description: "อบรมฝ่ายขายและบัญชีใช้ระบบใบเสนอราคา/ใบแจ้งหนี้ (งานภายใน)",
            project_status: "in_progress",
            project_start_date: "2026-10-01",
            project_due_date: "2026-10-16",
            tasks: [
                { type: "item", description: "อบรมฝ่ายขาย: ใบเสนอราคาและการอนุมัติ" },
                { type: "item", description: "อบรมฝ่ายบัญชี: ใบแจ้งหนี้และใบเสร็จ" },
            ],
        });
    });

    // ── บริการรายรอบ (2026-10-31): ลูกค้าเก่าที่ต่ออายุอยู่ก่อนมีระบบ (เพิ่มเอง) · ใกล้ครบ · เลยกำหนด · พัก · ยกเลิก · มีประวัติรอบ
    // (รายการจากใบเสนอราคาที่ตอบรับ เช่น โฮสติ้ง/โดเมนของเว็บคลินิก ระบบตั้งให้เองตอนตอบรับ)
    const addRenewal = async (body) =>
        (
            await as(accountant, "POST", "/V1/renewals", {
                rnw_channel: "direct",
                rnw_notes: "ต่ออายุอยู่ก่อนเริ่มใช้ระบบ (เพิ่มเอง)",
                ...body,
            })
        ).rnw_id;
    on("2026-10-03", "รายการต่ออายุของลูกค้าเก่า", async () => {
        state.renewals = {};
        state.renewals.goldenDomain = await addRenewal({
            rnw_client_id: clients.goldenSea,
            rnw_product_id: product.domain.id,
            rnw_label: "goldensea-logistics.com",
            rnw_price: "650",
            rnw_cycle_months: 12,
            rnw_next_due_date: "2026-10-20",
        });
        state.renewals.digitalHosting = await addRenewal({
            rnw_client_id: clients.andamanDigital,
            rnw_product_id: product.hosting.id,
            rnw_label: "andaman-digital.co.th",
            rnw_price: "16500",
            rnw_cycle_months: 12,
            rnw_next_due_date: "2026-11-12",
        });
        state.renewals.tourDomain = await addRenewal({
            rnw_client_id: clients.krabiHoliday,
            rnw_project_id: state.projects.tour,
            rnw_product_id: product.domain.id,
            rnw_label: "krabiholidaytour.com",
            rnw_price: "650",
            rnw_cycle_months: 12,
            rnw_next_due_date: "2026-10-25",
        });
        state.renewals.seafoodCare = await addRenewal({
            rnw_client_id: clients.aoNangSeafood,
            rnw_product_id: product.maintenance.id,
            rnw_label: "ดูแลเว็บร้านอาหาร",
            rnw_price: "1500",
            rnw_cycle_months: 1,
            rnw_next_due_date: "2026-10-15",
        });
        state.renewals.palmDomain = await addRenewal({
            rnw_client_id: clients.siamPalm,
            rnw_product_id: product.domain.id,
            rnw_label: "siampalm-buy.com",
            rnw_price: "650",
            rnw_cycle_months: 12,
            rnw_next_due_date: "2026-12-01",
        });
    });
    on("2026-10-14", "พักดูแลเว็บร้านอาหาร (ร้านปิดปรับปรุง)", () =>
        as(accountant, "POST", `/V1/renewals/${state.renewals.seafoodCare}/pause`, {
            reason: "ร้านปิดปรับปรุง 1 เดือน",
            rnw_version: 0,
        }),
    );
    on("2026-10-16", "ยกเลิกโดเมนสยามปาล์ม (ลูกค้าจดเอง)", () =>
        as(accountant, "POST", `/V1/renewals/${state.renewals.palmDomain}/cancel`, {
            reason: "ลูกค้าย้ายไปจดโดเมนกับฝ่าย IT ของบริษัทเอง",
            rnw_version: 0,
        }),
    );
    on("2026-10-21", "ออกใบแจ้งหนี้ต่ออายุโดเมนกระบี่ ฮอลิเดย์", async () => {
        const created = await as(accountant, "POST", "/V1/renewals/invoice", {
            items: [{ rnw_id: state.renewals.tourDomain, rnw_version: 0 }],
        });
        await as(accountant, "POST", `/V1/invoices/${created.inv_id}/submit`, {});
        const detail = await as(accountant, "GET", `/V1/invoices/${created.inv_id}`);
        if (detail.invoice.inv_status === "pending_approval")
            await as("hatsanai", "POST", `/V1/invoices/${created.inv_id}/approve`, {});
        await sales.issueIfDraft(accountant, created.inv_id);
    });

    // ── งานเลยกำหนด: ระบบจองห้องพัก (หลังตั้งความคืบหน้าวันสุดท้าย)
    on(lastDay, "งานระบบจองห้องพักเลยกำหนด", () => setTaskDue("nattapon", state.projects.resort, 0, "2026-10-20"));
}

module.exports = { scheduleNextStepScenarios, setTaskDue };
