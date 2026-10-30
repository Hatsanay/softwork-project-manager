// ลำดับบิตสิทธิ์ในหน้าเว็บ (frontend/app/components/bit.tsx) ต้องตรงกับ backend (src/shared/permissions.mjs)
// ถ้าไม่ตรง ติ๊กสิทธิ์ข้อหนึ่งในหน้าแก้ role แต่ backend จะบันทึกเป็นอีกข้อหนึ่ง — เป็นช่องโหว่สิทธิ์ทันที
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");

const BIT_FILE = path.join(__dirname, "..", "..", "frontend", "app", "components", "bit.tsx");

function readBitFileWithoutComments() {
    const text = fs.readFileSync(BIT_FILE, "utf8");
    return text
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
}

// ดึง key ของรายการที่เขียนจบในบรรทัดเดียว { key: "x", ... } — แถวที่มี children (หัวเมนู) จะไม่ถูกนับ
function extractLeafKeys(sectionText) {
    const leafPattern = /\{\s*key:\s*"(\w+)"[^{}]*\}/g;
    return [...sectionText.matchAll(leafPattern)].map((match) => match[1]);
}

function sectionBetween(text, startMarker, endMarker) {
    const start = text.indexOf(startMarker);
    const end = text.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, `หา ${startMarker} ใน bit.tsx ไม่เจอ · ไฟล์ถูกเปลี่ยนโครง ต้องแก้เทสต์นี้ตาม`);
    return text.slice(start, end);
}

test("PERMISSION_GROUPS ในหน้าเว็บเรียงบิตตรงกับ PERMISSION_KEYS ของ backend ทุกตำแหน่ง", () => {
    const text = readBitFileWithoutComments();
    const groupsSection = sectionBetween(text, "export const PERMISSION_GROUPS", "export const GROUP_STARTS");
    assert.deepEqual(extractLeafKeys(groupsSection), PERMISSION_KEYS);
});

test("เมนูทุกข้อใน MENU_DEFS ผูกกับสิทธิ์ที่มีอยู่จริง", () => {
    const text = readBitFileWithoutComments();
    const menuSection = sectionBetween(text, "export const MENU_DEFS", "export type PermGroup");
    const menuKeys = extractLeafKeys(menuSection);
    assert.ok(menuKeys.length > 0);
    for (const key of menuKeys) {
        assert.ok(PERMISSION_KEYS.includes(key), `เมนู "${key}" ไม่มีบิตสิทธิ์คู่กัน`);
    }
});
