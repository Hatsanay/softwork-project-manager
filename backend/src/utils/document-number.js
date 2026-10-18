// เลขที่เอกสารขาย (2026-10-13, docs/plans/2026-10-08-sales-cycle.md กติกาข้อ 1)
//
// รูปแบบ: ประเภท + "-" + ปีเดือนวัน (ค.ศ.) + "-" + เลขรัน 6 หลัก เช่น QT-20261231-000001 (18 ตัว)
// รีเซ็ตทุกวัน · ลำดับเดียวร่วมกันทุกสาขา (เลขไม่ซ้ำทั้งบริษัท)
//
// **ต้องเรียกด้วย conn ที่อยู่ใน transaction เดียวกับการบันทึกเอกสาร** (ส่งต่อจาก withTransaction):
//   - INSERT ... ON DUPLICATE KEY UPDATE ล็อกแถวลำดับเลขไว้จนจบ transaction → สองคำขอพร้อมกันไม่ได้เลขซ้ำ
//   - บันทึกเอกสารไม่สำเร็จแล้ว rollback → ลำดับเลขถอยกลับด้วย → ไม่มีเลขข้าม (ข้อกำหนดของเอกสารทางภาษี)
// LAST_INSERT_ID(ค่า) จำค่าไว้เฉพาะ connection นี้ ไม่ปนกับคำขออื่นที่ทำพร้อมกัน

// EX ค่าใช้จ่าย/บิลผู้ขาย · EC ใบเบิกเงินพนักงาน (เฟส 2 — ได้เลขตอนอนุมัติครบ)
// PV ใบสำคัญจ่าย (ขั้น 2-4) · CN ใบลดหนี้ (2026-10-18 — ได้เลขตอนอนุมัติครบ) · DN ใบเพิ่มหนี้ (ขั้น N-2 — ใบแจ้งหนี้ชนิดเพิ่มหนี้)
const DOCUMENT_TYPES = ["QT", "IV", "BN", "RE", "EX", "EC", "PV", "CN", "DN"];
const MAX_NUMBERS_PER_DAY = 999_999;
// เลขรันต่อปี (ไม่รีเซ็ตทุกวัน): WT หนังสือรับรองหัก ณ ที่จ่าย — เล่มที่ = ปี ค.ศ. · แถวลำดับใช้ ds_date = "YYYY0000"
const YEARLY_DOCUMENT_TYPES = ["WT"];
const MAX_NUMBERS_PER_YEAR = 999_999;
const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "2026-12-31" → "20261231" · ตรวจว่าเป็นวันที่มีอยู่จริง (กัน "2026-02-30")
 * @param {string} dateText
 * @returns {string}
 */
function toCompactDate(dateText) {
    const match = String(dateText).match(DATE_TEXT);
    if (!match) {
        throw new Error(`วันที่เอกสารต้องเป็นรูปแบบ YYYY-MM-DD (ได้ ${dateText})`);
    }

    const [, year, month, day] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const isRealDate = date.toISOString().startsWith(`${year}-${month}-${day}`);
    if (!isRealDate) {
        throw new Error(`ไม่มีวันที่ ${dateText} ในปฏิทิน`);
    }

    return `${year}${month}${day}`;
}

/**
 * ออกเลขที่เอกสารถัดไปของวันนั้น
 * @param {import("mysql2/promise").PoolConnection} conn connection ที่ beginTransaction แล้ว
 * @param {"QT" | "IV" | "BN" | "RE" | "EX" | "EC" | "PV" | "CN" | "DN"} documentType
 * @param {string} documentDate วันที่เอกสาร "YYYY-MM-DD" ตามเวลาไทย (ใช้ todayBangkok())
 * @returns {Promise<string>} เช่น "QT-20261231-000001"
 */
async function issueDocumentNumber(conn, documentType, documentDate) {
    if (!DOCUMENT_TYPES.includes(documentType)) {
        throw new Error(`ประเภทเอกสารไม่รู้จัก: ${documentType}`);
    }
    const compactDate = toCompactDate(documentDate);

    await conn.query(
        `INSERT INTO tb_document_sequences (ds_doc_type, ds_date, ds_last)
         VALUES (?, ?, LAST_INSERT_ID(1))
         ON DUPLICATE KEY UPDATE ds_last = LAST_INSERT_ID(ds_last + 1)`,
        [documentType, compactDate],
    );
    const [[row]] = await conn.query("SELECT LAST_INSERT_ID() AS sequence");
    const sequence = Number(row.sequence);

    if (sequence > MAX_NUMBERS_PER_DAY) {
        throw new Error(`เลขที่เอกสาร ${documentType} ของวันที่ ${documentDate} เกิน ${MAX_NUMBERS_PER_DAY} ฉบับ`);
    }

    return `${documentType}-${compactDate}-${String(sequence).padStart(6, "0")}`;
}

/**
 * ออกเลขที่รันต่อปีถัดไป (เงื่อนไข transaction เดียวกับ issueDocumentNumber — rollback แล้วเลขไม่ข้าม)
 * @param {import("mysql2/promise").PoolConnection} conn connection ที่ beginTransaction แล้ว
 * @param {"WT"} documentType
 * @param {string} documentDate วันที่เอกสาร "YYYY-MM-DD" ตามเวลาไทย — ปีของวันนี้คือเล่มที่
 * @returns {Promise<{ number: string, year: string, sequence: number }>} เช่น { number: "WT-2026-000001", year: "2026", sequence: 1 }
 */
async function issueYearlyNumber(conn, documentType, documentDate) {
    if (!YEARLY_DOCUMENT_TYPES.includes(documentType)) {
        throw new Error(`ประเภทเอกสารรันต่อปีไม่รู้จัก: ${documentType}`);
    }
    const year = toCompactDate(documentDate).slice(0, 4);

    await conn.query(
        `INSERT INTO tb_document_sequences (ds_doc_type, ds_date, ds_last)
         VALUES (?, ?, LAST_INSERT_ID(1))
         ON DUPLICATE KEY UPDATE ds_last = LAST_INSERT_ID(ds_last + 1)`,
        [documentType, `${year}0000`],
    );
    const [[row]] = await conn.query("SELECT LAST_INSERT_ID() AS sequence");
    const sequence = Number(row.sequence);
    if (sequence > MAX_NUMBERS_PER_YEAR) {
        throw new Error(`เลขที่เอกสาร ${documentType} ของปี ${year} เกิน ${MAX_NUMBERS_PER_YEAR} ฉบับ`);
    }
    return { number: `${documentType}-${year}-${String(sequence).padStart(6, "0")}`, year, sequence };
}

module.exports = { issueDocumentNumber, issueYearlyNumber, toCompactDate, DOCUMENT_TYPES };
