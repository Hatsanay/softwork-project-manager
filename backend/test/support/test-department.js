// แผนกสำหรับเทสต์ — พนักงานต้องมีแผนก (รหัสพนักงาน = รหัสแผนก + วันเริ่มงาน + ลำดับ · 2026-10-18)
// สร้างผ่าน API ด้วยบัญชีผู้ดูแล (loginAsAdmin แล้ว) ที่สำนักงานใหญ่ · รหัสแผนก = 00000 + ตัวย่อ
const HEAD_OFFICE_ID = "BRA202601010000001";

/**
 * @param {{ callApi: Function }} api เซิร์ฟเวอร์เทสต์ที่ loginAsAdmin แล้ว
 * @param {string} [abbr] ตัวย่อ 3 ตัว
 * @returns {Promise<string>} dep_id
 */
async function createTestDepartment(api, abbr = "TST", name = "แผนกทดสอบ") {
    const response = await api.callApi("POST", "/V1/departments", {
        body: { dep_name: name, dep_branch_id: HEAD_OFFICE_ID, dep_abbr: abbr },
    });
    if (response.status !== 201) throw new Error("สร้างแผนกทดสอบไม่สำเร็จ: " + JSON.stringify(response.body));
    return response.body.dep_id;
}

module.exports = { createTestDepartment, HEAD_OFFICE_ID };
