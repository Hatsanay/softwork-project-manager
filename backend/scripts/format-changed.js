// จัดรูปแบบโค้ดด้วย Prettier เฉพาะไฟล์ที่แก้หรือเพิ่มใหม่ (2026-10-13, docs/CODING_GUIDELINES.md หัวข้อ 7.2)
//
// ไม่จัดทั้ง repo ทีเดียว — ไฟล์ที่ไม่ได้แตะจะไม่เปลี่ยน ประวัติใน git จะได้ไม่ปนกับการจัดรูปแบบ
// ใช้: npm run format:changed (รันจากโฟลเดอร์ backend แต่จัดได้ทั้ง backend และ frontend)

const { execFileSync } = require("child_process");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..");
const FORMATTABLE = /\.(js|cjs|mjs|ts|tsx|jsx|json|css)$/;

function listChangedFiles() {
    const output = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: REPO_ROOT, encoding: "utf8" });
    const files = [];
    for (const line of output.split("\n")) {
        if (!line.trim()) continue;
        const status = line.slice(0, 2);
        if (status.includes("D")) continue; // ไฟล์ที่ลบไปแล้วจัดรูปแบบไม่ได้
        const filePath = line.slice(3).split(" -> ").pop();
        if (FORMATTABLE.test(filePath)) files.push(filePath);
    }
    return files;
}

const files = listChangedFiles();
if (files.length === 0) {
    console.log("ไม่มีไฟล์ที่แก้ ไม่ต้องจัดรูปแบบ");
    process.exit(0);
}

const prettier = path.join(__dirname, "..", "node_modules", "prettier", "bin", "prettier.cjs");
execFileSync(process.execPath, [prettier, "--write", "--ignore-unknown", ...files], { cwd: REPO_ROOT, stdio: "inherit" });
