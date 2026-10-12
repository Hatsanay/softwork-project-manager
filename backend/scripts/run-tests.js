// รันชุดเทสต์ 2 รอบ: timezone ของเครื่อง และ UTC (2026-10-12, risk-fixes R2)
//
// เครื่อง dev ตั้งเวลาไทย แต่เซิร์ฟเวอร์ production อาจเป็น UTC — บั๊กวันที่เลื่อน 1 วันจะโผล่เฉพาะรอบ UTC
// ตั้ง TZ ผ่าน environment ของ process ลูก ใช้ได้ทั้ง Windows และ Linux (ไม่ต้องพึ่ง cross-env)

const { spawnSync } = require("child_process");
const path = require("path");

const BACKEND_DIR = path.join(__dirname, "..");
const TEST_FILES = "test/**/*.test.js";

const ROUNDS = [
    { name: "timezone ของเครื่อง", timeZone: process.env.TZ },
    { name: "UTC (แบบเซิร์ฟเวอร์ production)", timeZone: "UTC" },
];

let hasFailure = false;

for (const round of ROUNDS) {
    console.log(`\n━━━ เทสต์รอบ: ${round.name} ━━━`);
    const environment = { ...process.env };
    if (round.timeZone) environment.TZ = round.timeZone;
    else delete environment.TZ;

    const result = spawnSync(process.execPath, ["--test", TEST_FILES], {
        cwd: BACKEND_DIR,
        env: environment,
        stdio: "inherit",
    });
    if (result.status !== 0) hasFailure = true;
}

if (hasFailure) {
    console.error("\nมีเทสต์ไม่ผ่าน (ดูรายละเอียดด้านบน)");
    process.exit(1);
}
console.log("\nเทสต์ผ่านทั้ง 2 รอบ");
