// ─── การอนุมัติหลายชั้นของเอกสารขาย (ฟังก์ชันล้วน ไม่แตะฐานข้อมูล) — backend ตัดสิน · หน้าเว็บใช้แสดงล่วงหน้า ────
// ใช้กับใบเสนอราคา (QT) และใบแจ้งหนี้ที่สร้างเอง (IV, ช่วง 1B) — กติกาแยกตามประเภทเอกสาร
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// แบบระบบ: docs/plans/2026-10-08-sales-cycle.md หัวข้อ 2–3 · เทสต์: backend/test/approval-flow.test.js
//
// - แผนอนุมัติ = ทุกชั้นที่ "ยอดก่อน VAT เป็นบาท ≥ ยอดขั้นต่ำของชั้น" เรียงตามชั้น (ชั้น 1 ยอด 0 จึงอยู่เสมอ)
// - กดอนุมัติครั้งเดียว ผ่านชั้นถัดไปต่อเนื่องได้ ถ้าผู้กดมี role อยู่ในชั้นนั้นด้วย และชั้นนั้นไม่ได้บังคับ "คนละคน"
// - ชั้นที่บังคับคนละคน: คนที่อนุมัติชั้นใดก่อนหน้าในรอบเดียวกันแล้ว อนุมัติชั้นนี้ไม่ได้

import { parseHundredths } from "./money.mjs";

/**
 * @typedef {object} PlanLevel
 * @property {number} level
 * @property {string} min_amount_thb
 * @property {boolean} require_distinct
 * @property {Array<{ role_id: string, role_name: string }>} roles
 */

/**
 * @param {Array<{ al_level: number, al_min_amount_thb: string, al_require_distinct: boolean, roles: Array<{ role_id: string, role_name: string }> }>} levels กติกาปัจจุบัน
 * @param {string | bigint} afterDiscountThb ยอดก่อน VAT เป็นบาท
 * @returns {PlanLevel[]}
 */
export function buildApprovalPlan(levels, afterDiscountThb) {
    const amount =
        typeof afterDiscountThb === "bigint" ? afterDiscountThb : parseHundredths(afterDiscountThb, "ยอดเป็นบาท");
    return [...levels]
        .sort((first, second) => first.al_level - second.al_level)
        .filter((level) => parseHundredths(level.al_min_amount_thb, "ยอดขั้นต่ำ") <= amount)
        .map((level) => ({
            level: level.al_level,
            min_amount_thb: level.al_min_amount_thb,
            require_distinct: Boolean(level.al_require_distinct),
            roles: level.roles.map((role) => ({ role_id: role.role_id, role_name: role.role_name })),
        }));
}

function roleNames(level) {
    return level.roles.map((role) => role.role_name).join(", ") || "ยังไม่ได้กำหนด role";
}

/**
 * ผู้ใช้คนนี้กดอนุมัติได้ไหม และกดครั้งนี้ผ่านชั้นไหนบ้าง
 * @param {object} input
 * @param {PlanLevel[]} input.plan
 * @param {number} input.currentLevel ชั้นที่รออยู่
 * @param {Array<{ level: number, user_id: string }>} input.approvalsThisRound การอนุมัติที่บันทึกแล้วในรอบนี้
 * @param {{ user_id: string, role_id: string | null, can_approve: boolean }} input.actor can_approve = มีสิทธิ์อนุมัติเอกสารประเภทนี้
 * @param {string} [input.documentName] ชื่อเอกสารในข้อความ เช่น "ใบแจ้งหนี้"
 * @param {string | null} input.creatorId
 * @param {boolean} input.allowSelfApproval
 * @returns {{ canApprove: boolean, reason: string | null, levels: number[], isFinal: boolean, nextLevel: PlanLevel | null, stopReason: string | null }}
 */
export function evaluateApproval({
    plan,
    currentLevel,
    approvalsThisRound,
    actor,
    creatorId,
    allowSelfApproval,
    documentName = "ใบเสนอราคา",
}) {
    const blocked = (reason) => ({
        canApprove: false,
        reason,
        levels: [],
        isFinal: false,
        nextLevel: null,
        stopReason: null,
    });

    const startIndex = plan.findIndex((level) => level.level === currentLevel);
    if (startIndex === -1) return blocked("ใบนี้ไม่ได้รออนุมัติ");
    if (!actor.can_approve) return blocked(`คุณไม่มีสิทธิ์อนุมัติ${documentName}`);
    if (actor.user_id === creatorId && !allowSelfApproval) {
        return blocked("คุณอนุมัติใบนี้ไม่ได้ เพราะคุณเป็นผู้สร้าง (หลักควบคุมภายใน) · ต้องให้ผู้อนุมัติคนอื่น");
    }

    const approverIds = new Set(approvalsThisRound.map((approval) => approval.user_id));
    const firstLevel = plan[startIndex];
    const hasRole = (level) => level.roles.some((role) => role.role_id === actor.role_id);

    if (!hasRole(firstLevel)) {
        return blocked(`ชั้น ${firstLevel.level} ต้องให้ผู้ที่มี role ${roleNames(firstLevel)} อนุมัติ`);
    }
    if (firstLevel.require_distinct && approverIds.has(actor.user_id)) {
        return blocked(
            `ชั้น ${firstLevel.level} กำหนดให้เป็นคนละคนกับผู้อนุมัติชั้นก่อนหน้า · ต้องให้ ${roleNames(firstLevel)} คนอื่นอนุมัติ`,
        );
    }

    const levels = [firstLevel.level];
    let nextLevel = null;
    let stopReason = null;
    for (const level of plan.slice(startIndex + 1)) {
        if (level.require_distinct) {
            nextLevel = level;
            stopReason = `ชั้น ${level.level} ต้องให้ผู้อนุมัติคนอื่น (${roleNames(level)}) อนุมัติต่อ เพราะชั้นนี้กำหนดให้เป็นคนละคน`;
            break;
        }
        if (!hasRole(level)) {
            nextLevel = level;
            stopReason = `ชั้น ${level.level} ต้องให้ ${roleNames(level)} อนุมัติต่อ`;
            break;
        }
        levels.push(level.level);
    }

    const isFinal = levels[levels.length - 1] === plan[plan.length - 1].level;
    return { canApprove: true, reason: null, levels, isFinal, nextLevel, stopReason };
}
