// ชุดข้อมูลจำลอง (2026-10-25 · P-4) — export.js / verify.js / seed-company-data อ่านจากที่นี่ที่เดียว
//
//   company (ค่าเริ่มต้น)    บริษัทที่จดแล้ว ทำงานจริงครบทุกฝ่าย        → database/mock_data.sql
//   pre-incorporation       ช่วงก่อนจดบริษัท: Fastwork แบ่งกำไร เงินทุน → database/mock_data_pre_incorporation.sql
// เลือกชุดด้วย --set <ชื่อ> เช่น npm run mock:export -- --set pre-incorporation (หรือ npm run mock:export:pre)

// ตารางของช่วงก่อนจด — ชุดบริษัทไม่มีข้อมูลในตารางเหล่านี้ (อยู่ในอีกชุด)
const PRE_INCORPORATION_TABLES = [
    "tb_fastwork_milestones",
    "tb_fastwork_payouts",
    "tb_project_shares",
    "tb_share_advances",
    "tb_share_settlements",
    "tb_share_settlement_lines",
    "tb_capital_entries",
];

const nonEmpty = (pick) => (body) => ((pick(body) ?? []).length > 0 ? null : "ไม่มีข้อมูล");

const SETS = {
    company: {
        label: "บริษัทที่จดแล้ว",
        sqlFile: "mock_data.sql",
        uploadsDir: "mock_uploads",
        description: [
            'บริษัทสมมติ "ซอฟต์เวิร์ก ดิเวลลอปเมนท์" กระบี่ ทำงานจริง เม.ย.–ต.ค. 2026: ขาย จัดซื้อ โปรเจกต์ บุคคล ลงเวลา เงินเดือน',
            "รายละเอียด: docs/plans/2026-10-24-mock-data.md",
        ],
        usernames: "admin hatsanai siriporn thanawat kamonchanok wannipa nattapon piyapong\n--   supawadee chonthicha kittisak weerayut apichart",
        // ตารางว่างได้ (ชื่อ → เหตุผล) · ตารางอื่นว่าง = ข้อมูลจำลองยังไม่ครอบคลุม
        emptyAllowed: new Map([
            ["tb_error_logs", "ระบบไม่มีข้อผิดพลาดระหว่างใส่ข้อมูล"],
            ...PRE_INCORPORATION_TABLES.map((table) => [table, "อยู่ในชุดช่วงก่อนจด (mock_data_pre_incorporation.sql)"]),
        ]),
        // null = ทุกตารางที่ไม่อยู่ใน emptyAllowed ต้องมีข้อมูล
        requiredTables: null,
        requiresShareLinkEmail: true,
        resultCounts: ["tb_users", "tb_employees", "tb_quotations", "tb_invoices", "tb_attendance_punches", "tb_payroll_runs"],
        checks: [
            ["hatsanai", "/V1/dashboard/summary", () => null],
            ["hatsanai", "/V1/projects", nonEmpty((body) => body.data ?? body)],
            ["siriporn", "/V1/invoices", nonEmpty((body) => body.data)],
            ["kamonchanok", "/V1/credit-notes", nonEmpty((body) => body.data)],
            ["kamonchanok", "/V1/billing-notes", nonEmpty((body) => body.data)],
            ["kamonchanok", "/V1/receipts", nonEmpty((body) => body.data)],
            ["kamonchanok", "/V1/expenses", nonEmpty((body) => body.data)],
            ["kamonchanok", "/V1/payments", nonEmpty((body) => body.data)],
            ["kamonchanok", "/V1/receivables/aging", () => null],
            ["kamonchanok", "/V1/payables/aging", () => null],
            ["hatsanai", "/V1/reports/sales?from=2026-04-01&to=2026-10-31", () => null],
            ["kamonchanok", "/V1/reports/withholding?month=2026-09&form=PND53", () => null],
            ["wannipa", "/V1/payroll/runs", nonEmpty((body) => body.data)],
            ["wannipa", "/V1/attendance/board?date=2026-10-22", nonEmpty((body) => body.rows)],
            ["wannipa", "/V1/attendance/summary?month=2026-09", nonEmpty((body) => body.rows)],
            ["supawadee", "/V1/attendance/me?month=2026-09", nonEmpty((body) => body.days)],
            ["supawadee", "/V1/leave/me?year=2026", nonEmpty((body) => body.requests)],
            ["nattapon", "/V1/timesheet/approvals", () => null],
            ["siriporn", "/V1/service-requests", nonEmpty((body) => body.data)],
            ["siriporn", "/V1/order-links", nonEmpty((body) => body.data)],
        ],
    },
    "pre-incorporation": {
        label: "ช่วงก่อนจดบริษัท",
        sqlFile: "mock_data_pre_incorporation.sql",
        uploadsDir: "mock_uploads_pre_incorporation",
        description: [
            "ผู้ประกอบการบุคคลธรรมดา (ยังไม่จดบริษัท ยังไม่จด VAT) เม.ย.–ต.ค. 2026: งาน Fastwork 6 งาน ลูกค้าตรง 1 งาน",
            "ทีมแบ่งกำไรรายโปรเจกต์ (ไม่มีเงินเดือน) · เงินทุนสะสมเพื่อจดบริษัท · รายละเอียด: docs/plans/2026-10-24-pre-incorporation.md ข้อ 13",
        ],
        usernames: "admin hatsanai nattapon supawadee chonthicha",
        // ช่วงนี้ไม่มีพนักงาน/เงินเดือน/ลงเวลา → ตารางอื่นว่างได้ · ตรวจเฉพาะตารางที่ชุดนี้ต้องมี
        emptyAllowed: new Map(),
        requiredTables: [
            ...PRE_INCORPORATION_TABLES,
            "tb_projects",
            "tb_project_members",
            "tb_clients",
            "tb_quotations",
            "tb_invoices",
            "tb_receipts",
            "tb_expenses",
            "tb_order_links",
            "tb_service_requests",
            "tb_service_request_items",
            "tb_service_request_answers",
        ],
        requiresShareLinkEmail: false,
        resultCounts: ["tb_users", "tb_projects", "tb_fastwork_payouts", "tb_share_settlements", "tb_capital_entries"],
        checks: [
            ["hatsanai", "/V1/fastwork/overview", nonEmpty((body) => body.projects)],
            ["hatsanai", "/V1/fastwork/payouts", nonEmpty((body) => body.data)],
            ["hatsanai", "/V1/profit-shares/projects", nonEmpty((body) => body.data)],
            ["hatsanai", "/V1/capital", nonEmpty((body) => body.project_inflows)],
            ["hatsanai", "/V1/reports/sales?from=2026-04-01&to=2026-10-31", () => null],
            ["hatsanai", "/V1/invoices", nonEmpty((body) => body.data)],
            ["nattapon", "/V1/profit-shares/mine", nonEmpty((body) => body.data)],
            ["hatsanai", "/V1/service-requests", nonEmpty((body) => body.data)],
            ["hatsanai", "/V1/fastwork/price-catalog", nonEmpty((body) => body.catalog.products)],
            ["nattapon", "/V1/projects", nonEmpty((body) => body.data ?? body)],
        ],
    },
};

/** ชื่อชุดจาก argv (--set <ชื่อ>) · ไม่ระบุ = company */
function setFromArgs(argv = process.argv) {
    const index = argv.indexOf("--set");
    const name = index >= 0 ? argv[index + 1] : "company";
    if (!SETS[name]) throw new Error(`ไม่รู้จักชุด "${name}" · ใช้ได้: ${Object.keys(SETS).join(", ")}`);
    return { name, ...SETS[name] };
}

module.exports = { SETS, setFromArgs, PRE_INCORPORATION_TABLES };
