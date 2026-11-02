// ตรวจงาน Fastwork ที่ปิดยอดส่วนแบ่งไว้ทั้งที่เงินยังไม่เข้าครบ (อ่านอย่างเดียว · ไม่แก้ข้อมูล)
// ที่มา: ก่อน 2026-11-01 ปิดยอดได้แม้งวดยังไม่ได้เงิน (F-1 ใน docs/plans/2026-11-01-fastwork-flow-simplify.md)
// ใช้: npm run check:fastwork-settlements (ใช้ฐานข้อมูลตาม backend/.env)
// เจอแล้วให้เจ้าของตัดสินเองต่องาน:
//   - งวดนั้นลูกค้าจะจ่าย = ยกเลิกการปิดยอด (หน้าส่วนแบ่งของโปรเจกต์) แล้วบันทึกเงินให้ครบ ค่อยปิดใหม่
//   - งวดนั้นลูกค้าไม่จ่ายแล้ว = ยกเลิกการปิดยอด แล้วกด "ตัดงวด" ในหน้าโปรเจกต์ ค่อยปิดใหม่
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const pool = require("../src/config/db");

async function main() {
    const [rows] = await pool.query(
        `SELECT p.project_id, p.project_name, p.project_status, DATE_FORMAT(s.sst_settled_date, '%Y-%m-%d') AS settled_date,
                (SELECT COUNT(*) FROM tb_share_settlement_lines l WHERE l.ssl_settlement_id = s.sst_id AND l.ssl_status = 'paid' AND l.ssl_due <> 0) AS paid_lines,
                GROUP_CONCAT(m.fwm_name ORDER BY m.fwm_order SEPARATOR ', ') AS missing_milestones
         FROM tb_share_settlements s
         JOIN tb_projects p ON p.project_id = s.sst_project_id AND p.project_channel = 'fastwork'
         JOIN tb_fastwork_milestones m ON m.fwm_project_id = p.project_id AND m.fwm_cancelled_at IS NULL
         WHERE s.sst_status = 'settled'
           AND NOT EXISTS (SELECT 1 FROM tb_fastwork_payouts f WHERE f.fwp_milestone_id = m.fwm_id AND f.fwp_status = 'received')
         GROUP BY p.project_id, p.project_name, p.project_status, s.sst_id, s.sst_settled_date
         ORDER BY s.sst_settled_date`,
    );
    if (rows.length === 0) {
        console.log("ไม่พบงานที่ปิดยอดก่อนเงินเข้าครบ");
        return;
    }
    console.log(`พบ ${rows.length} งานที่ปิดยอดไว้แต่บางงวดเงินยังไม่เข้า:\n`);
    for (const row of rows) {
        console.log(`- ${row.project_id} · ${row.project_name}`);
        console.log(`  ปิดยอดวันที่ ${row.settled_date} · สถานะโปรเจกต์ ${row.project_status}`);
        console.log(`  งวดที่เงินยังไม่เข้า: ${row.missing_milestones}`);
        console.log(
            Number(row.paid_lines) > 0
                ? `  จ่ายส่วนแบ่งไปแล้ว ${row.paid_lines} คน · ยกเลิกการปิดยอดไม่ได้ ต้องคุยกับผู้รับและบันทึกแยก`
                : "  ยังไม่ได้จ่ายใคร · ยกเลิกการปิดยอดได้ที่หน้าส่วนแบ่งของโปรเจกต์",
        );
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
