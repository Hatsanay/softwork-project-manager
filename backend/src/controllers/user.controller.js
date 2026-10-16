const bcrypt = require("bcryptjs");
const { compressImage } = require("../utils/imageCompress");
const fs = require("fs/promises");
const path = require("path");
const pool = require("../config/db");
const { generateDailyId } = require("../utils/generateDailyId");
const { generateTempPassword } = require("../utils/generatePassword");
const { issueOtp, consumeOtp, markOtpUsed, OTP_TTL_MINUTES } = require("../utils/emailOtp");
const { sendEmailOtpEmail } = require("../utils/mailer");
const { effectiveRolePermission } = require("../utils/permissions");
const { ACCESS_ERRORS, findRolePermission, findUserAccess, canActOn, sendAccessError } = require("../utils/role-access");

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// ห้ามมี @ — login รับได้ทั้งอีเมลและชื่อผู้ใช้ในช่องเดียว ถ้าชื่อผู้ใช้มี @ ได้ อาจไปชนกับอีเมลของอีกคน
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,50}$/;
const USERNAME_RULE = "ชื่อผู้ใช้ต้องยาว 3-50 ตัว ใช้ได้เฉพาะ a-z, 0-9, จุด, ขีดกลาง, ขีดล่าง";

// ค่าว่าง = null (ไม่ได้ระบุ) · ระบุมาแต่รูปแบบผิด = { error }
function parseEmail(raw) {
    const email = String(raw ?? "").trim();
    if (!email) return { value: null };
    if (!EMAIL_PATTERN.test(email) || email.length > 255) return { error: "รูปแบบอีเมลไม่ถูกต้อง" };
    return { value: email };
}

function parseUsername(raw) {
    const username = String(raw ?? "").trim();
    if (!username) return { value: null };
    if (!USERNAME_PATTERN.test(username)) return { error: USERNAME_RULE };
    return { value: username };
}

// unique key ไหนชน บอกให้ตรงจุด (อีเมลกับชื่อผู้ใช้ซ้ำได้ทั้งคู่)
function duplicateMessage(err) {
    return String(err.sqlMessage ?? "").includes("uq_user_username")
        ? "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว"
        : "อีเมลนี้ถูกใช้งานแล้ว";
}

// ใช้เป็น dropdown เลือกผู้ใช้งาน (เช่น เพิ่มสมาชิกเข้าโปรเจกต์) เลยล็อกแค่ requireAuth
// ไม่ใช่ usersManagement เพราะ PM ทั่วไปที่ไม่มีสิทธิ์จัดการผู้ใช้งานระบบก็ต้องเพิ่มสมาชิกได้
async function forSelect(req, res, next) {
    try {
        const search = `%${req.query.search ?? ""}%`;
        const [rows] = await pool.query(
            `SELECT user_id, CONCAT(user_fname, ' ', user_lname) AS user_fullname
             FROM tb_users
             WHERE user_status = 'active' AND (user_fname LIKE ? OR user_lname LIKE ? OR user_email LIKE ?)
             ORDER BY user_fname
             LIMIT 20`,
            [search, search, search]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
}

// ข้อมูลของ "ตัวเอง" เสมอ — ใช้ user_id จาก token เท่านั้น
// (เดิมรับ ?user_id= จาก query ทำให้ใครที่ login อยู่ก็ดูข้อมูลส่วนตัวของคนอื่นได้ frontend ยังส่ง query มาได้แต่ถูกเพิกเฉย)
async function me(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT u.user_id, u.user_username, u.user_fname, u.user_lname,
                    CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname,
                    u.user_email, u.user_phone, u.user_line_uid, u.user_whatsapp_no,
                    u.user_avatar_url, u.user_must_change_password, u.user_branch_id, r.role_name
             FROM tb_users u
             LEFT JOIN tb_roles r ON r.role_id = u.user_role_id
             WHERE u.user_id = ?`,
            [req.user.user_id]
        );
        if (!rows[0]) return res.status(404).json({ message: "ไม่พบผู้ใช้งาน" });
        // สิทธิ์ ณ ตอนนี้ (role ระบบได้ครบ) — หน้าเว็บใช้ซ่อน/แสดงเมนูให้ตรงกับสิทธิ์ล่าสุด (2026-10-13)
        // เดิมใช้ค่าที่จำไว้ตอน login: แอดมินเปลี่ยนสิทธิ์ หรือระบบเพิ่มบิตใหม่ ผู้ใช้ต้องออกแล้วเข้าใหม่ถึงจะเห็นเมนูถูก
        res.json({ ...rows[0], role_permission: req.user.role_permission });
    } catch (err) {
        next(err);
    }
}

// ไม่แตะอีเมลแล้ว — ผู้ใช้เปลี่ยนอีเมลตัวเองได้ทางเดียวคือยืนยันด้วย OTP (requestMyEmailOtp/verifyMyEmailOtp)
// ไม่งั้นการยืนยันอีเมลตอนเข้าระบบครั้งแรกไม่มีความหมาย (แก้เป็นอีเมลอะไรก็ได้ที่หน้าโปรไฟล์โดยไม่ต้องยืนยัน)
async function updateMyProfile(req, res, next) {
    try {
        const { user_fname, user_lname, user_phone, user_line_id, user_whatApp_no } = req.body;
        if (!user_fname || !user_lname) {
            return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
        }

        await pool.query(
            `UPDATE tb_users SET
                user_fname = ?, user_lname = ?, user_phone = ?,
                user_line_uid = ?, user_whatsapp_no = ?
             WHERE user_id = ?`,
            [
                user_fname, user_lname, user_phone || null,
                user_line_id || null, user_whatApp_no || null,
                req.user.user_id,
            ]
        );

        res.json({ message: "แก้ไขโปรไฟล์สำเร็จ" });
    } catch (err) {
        next(err);
    }
}

// ─── ยืนยันอีเมลของตัวเองด้วย OTP (onboarding ครั้งแรก / เปลี่ยนอีเมลที่หน้าโปรไฟล์) ────────────────
const VERIFY_EMAIL_PURPOSE = "verify_email";

async function requestMyEmailOtp(req, res, next) {
    try {
        const email = parseEmail(req.body.email);
        if (email.error) return res.status(400).json({ message: email.error });
        if (!email.value) return res.status(400).json({ message: "กรุณากรอกอีเมล" });

        // อีเมลที่ผู้ใช้คนอื่นใช้อยู่แล้ว ไม่ต้องส่งรหัสไปให้เปลืองเปล่า (ยืนยันผ่านไปก็บันทึกไม่ได้อยู่ดีเพราะ unique)
        const [taken] = await pool.query(
            "SELECT user_id FROM tb_users WHERE user_email = ? AND user_id != ?",
            [email.value, req.user.user_id]
        );
        if (taken[0]) return res.status(409).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });

        const [[me]] = await pool.query(
            "SELECT CONCAT(user_fname, ' ', user_lname) AS fullname FROM tb_users WHERE user_id = ?",
            [req.user.user_id]
        );
        const { code, otp_id } = await issueOtp({ email: email.value, purpose: VERIFY_EMAIL_PURPOSE, userId: req.user.user_id });

        try {
            await sendEmailOtpEmail({ to: email.value, code, fullname: me?.fullname, expiresMinutes: OTP_TTL_MINUTES });
        } catch (mailErr) {
            // ส่งไม่ออก = รหัสนี้ไม่มีใครได้รับ ตัดทิ้งเลย กันนับเป็นโควตา "รหัสที่ยังใช้ได้" ค้างไว้เปล่าๆ
            await markOtpUsed(otp_id);
            if (mailErr.message === "SMTP_NOT_CONFIGURED") {
                return res.status(503).json({ message: "ระบบยังไม่ได้ตั้งค่าอีเมล (SMTP) กรุณาติดต่อผู้ดูแลระบบ" });
            }
            console.error("[user.controller] sendEmailOtpEmail failed:", mailErr.message);
            return res.status(502).json({ message: "ส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบอีเมลแล้วลองใหม่" });
        }

        res.json({ message: `ส่งรหัสยืนยันไปที่ ${email.value} แล้ว`, expires_minutes: OTP_TTL_MINUTES });
    } catch (err) {
        if (err.status === 429) return res.status(429).json({ message: err.message });
        next(err);
    }
}

async function verifyMyEmailOtp(req, res, next) {
    try {
        const email = parseEmail(req.body.email);
        if (email.error || !email.value) return res.status(400).json({ message: email.error ?? "กรุณากรอกอีเมล" });
        if (!/^\d{6}$/.test(String(req.body.otp ?? "").trim())) {
            return res.status(400).json({ message: "กรุณากรอกรหัสยืนยัน 6 หลัก" });
        }

        let otpId;
        try {
            otpId = await consumeOtp({ email: email.value, purpose: VERIFY_EMAIL_PURPOSE, userId: req.user.user_id, code: req.body.otp });
        } catch (otpErr) {
            return res.status(otpErr.status ?? 400).json({ message: otpErr.message });
        }

        try {
            await pool.query("UPDATE tb_users SET user_email = ? WHERE user_id = ?", [email.value, req.user.user_id]);
        } catch (dbErr) {
            // อีกคนยืนยันอีเมลเดียวกันสำเร็จไปก่อนระหว่างที่รอกรอกรหัส — ไม่ตัดรหัสทิ้ง แต่บอกตรงๆ ว่าใช้ไม่ได้
            if (dbErr.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
            throw dbErr;
        }
        await markOtpUsed(otpId);

        res.json({ message: "ยืนยันอีเมลสำเร็จ", user_email: email.value });
    } catch (err) {
        next(err);
    }
}

async function getAll(req, res, next) {
    try {
        const limit = Number(req.query.limit) || 10;
        const offset = Number(req.query.offset) || 0;
        const search = `%${req.query.search ?? ""}%`;

        const [rows] = await pool.query(
            `SELECT u.user_id, u.user_username, CONCAT(u.user_fname, ' ', u.user_lname) AS by_fullname,
                    u.user_email, u.user_phone, u.user_status, u.user_avatar_url,
                    u.user_created_at, u.user_updated_at, u.user_role_id,
                    r.role_name, r.role_type, r.role_permission
             FROM tb_users u
             LEFT JOIN tb_roles r ON r.role_id = u.user_role_id
             WHERE u.user_fname LIKE ? OR u.user_lname LIKE ? OR u.user_email LIKE ? OR u.user_username LIKE ?
             ORDER BY u.user_id DESC
             LIMIT ? OFFSET ?`,
            [search, search, search, search, limit, offset]
        );
        // can_manage: คนที่ดูอยู่จัดการผู้ใช้คนนี้ได้ไหม (สิทธิ์ไม่เกินตัวเอง — risk-fixes R25) ไม่ส่งสตริงสิทธิ์ดิบออกไป
        const data = rows.map(({ role_permission, user_role_id, ...user }) => ({
            ...user,
            can_manage: canActOn(req.user.role_permission, userPermission(user_role_id, user.role_type, role_permission)),
        }));
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM tb_users
             WHERE user_fname LIKE ? OR user_lname LIKE ? OR user_email LIKE ? OR user_username LIKE ?`,
            [search, search, search, search]
        );

        res.json({ data, total });
    } catch (err) {
        next(err);
    }
}

// ผู้ใช้ที่ไม่มี role = ไม่มีสิทธิ์ใดเลย
function userPermission(roleId, roleType, storedPermission) {
    if (!roleId) return "";
    return effectiveRolePermission(roleType, storedPermission);
}

async function getOne(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT u.user_id, u.user_username, u.user_fname, u.user_lname,
                    CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname,
                    u.user_email, u.user_phone, u.user_line_uid, u.user_whatsapp_no,
                    u.user_avatar_url, u.user_role_id, u.user_branch_id, u.user_status, u.user_must_change_password,
                    u.user_last_login_at, u.user_created_at, u.user_updated_at,
                    r.role_name, r.role_type, r.role_permission
             FROM tb_users u
             LEFT JOIN tb_roles r ON r.role_id = u.user_role_id
             WHERE u.user_id = ?`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ message: "ไม่พบผู้ใช้งาน" });

        const { role_type, role_permission, ...user } = rows[0];
        res.json({
            ...user,
            // หน้าแก้ไขผู้ใช้ใช้แสดงแถบแจ้งและซ่อนปุ่มที่ทำไม่ได้ (risk-fixes R25)
            can_manage: canActOn(req.user.role_permission, userPermission(user.user_role_id, role_type, role_permission)),
            is_self: user.user_id === req.user.user_id,
        });
    } catch (err) {
        next(err);
    }
}

// ผู้กระทำจัดการผู้ใช้คนนี้ได้ไหม (สิทธิ์ของผู้ใช้คนนี้ไม่เกินผู้กระทำ — risk-fixes R25)
// คืน { error } พร้อมสถานะที่ต้องตอบ หรือ { target } ข้อมูลสิทธิ์ปัจจุบันของผู้ใช้คนนั้น
async function checkCanManageUser(req, userId) {
    const target = await findUserAccess(userId);
    if (!target) return { notFound: true };
    const isSelf = userId === req.user.user_id;
    if (!isSelf && !canActOn(req.user.role_permission, target.permission)) {
        return { error: ACCESS_ERRORS.userAboveActor };
    }
    return { target, isSelf };
}

// role ที่จะมอบต้องมีอยู่จริงและมีสิทธิ์ไม่เกินผู้มอบ (risk-fixes R25)
async function checkCanAssignRole(req, roleId) {
    const rolePermission = await findRolePermission(roleId);
    if (rolePermission === null) return { invalid: true };
    if (!canActOn(req.user.role_permission, rolePermission)) return { error: ACCESS_ERRORS.assignRoleAboveActor };
    return {};
}

// สาขาเริ่มต้นของผู้ใช้ (2026-10-13, วงจรขาย 1A) — ใช้เติมสาขาให้เอกสารที่ผู้ใช้สร้าง ไม่จำกัดการมองเห็น
// ว่าง = สำนักงานใหญ่ · ต้องเป็นสาขาที่มีอยู่จริง · เลือกใหม่ต้องเป็นสาขาที่เปิดใช้งาน (สาขาเดิมที่ถูกปิดไปแล้วคงไว้ได้)
// ไม่ส่งฟิลด์นี้มาเลย (หน้าเว็บเวอร์ชันเก่า) = ไม่เปลี่ยนค่าเดิม
async function resolveBranchId(rawBranchId, currentBranchId) {
    if (rawBranchId === undefined) return { value: currentBranchId };
    const branchId = rawBranchId ? String(rawBranchId) : null;
    if (branchId === null) return { value: null };

    const [[branch]] = await pool.query("SELECT branch_status FROM tb_branches WHERE branch_id = ?", [branchId]);
    if (!branch) return { error: "ไม่พบสาขาที่เลือก อาจถูกลบไปแล้ว กรุณาเลือกใหม่" };
    const isUnchanged = branchId === currentBranchId;
    if (branch.branch_status !== "active" && !isUnchanged) {
        return { error: "สาขาที่เลือกถูกปิดใช้งานแล้ว กรุณาเลือกสาขาอื่น" };
    }
    return { value: branchId };
}

async function create(req, res, next) {
    try {
        const {
            user_fname, user_lname, user_phone,
            user_line_id, user_whatApp_no, user_role_id,
        } = req.body;

        if (!user_fname || !user_lname) {
            return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
        }
        // อีเมลไม่บังคับ — ไม่ใส่ = ผู้ใช้ยืนยันอีเมลเองด้วย OTP ตอนเข้าระบบครั้งแรก (login ด้วยชื่อผู้ใช้ไปก่อน)
        const email = parseEmail(req.body.user_email);
        if (email.error) return res.status(400).json({ message: email.error });
        const username = parseUsername(req.body.user_username);
        if (username.error) return res.status(400).json({ message: username.error });

        const roleCheck = await checkCanAssignRole(req, user_role_id || null);
        if (roleCheck.invalid) {
            return res.status(400).json({ message: "ไม่พบสิทธิ์ (role) ที่เลือก อาจถูกลบไปแล้ว กรุณาเลือกใหม่" });
        }
        if (roleCheck.error) return sendAccessError(res, roleCheck.error);

        const branch = await resolveBranchId(req.body.user_branch_id ?? null, null);
        if (branch.error) return res.status(400).json({ message: branch.error });

        // ไม่รับรหัสผ่านจากฟอร์มแล้ว — gen รหัสผ่านชั่วคราวให้แทน แล้วบังคับเปลี่ยนตอน login ครั้งแรก
        const temp_password = generateTempPassword();
        const passwordHash = await bcrypt.hash(temp_password, 10);
        const user_id = await generateDailyId("tb_users", "user_id", "USE");
        // ไม่ระบุชื่อผู้ใช้ = ใช้รหัสผู้ใช้ไปก่อน (ไม่ซ้ำแน่นอน) แอดมินแก้เป็นชื่อที่จำง่ายกว่าทีหลังได้ (เหมือน fasttiw)
        const user_username = username.value ?? user_id;

        await pool.query(
            `INSERT INTO tb_users
                (user_id, user_username, user_fname, user_lname, user_email, user_password, user_phone,
                 user_line_uid, user_whatsapp_no, user_role_id, user_branch_id, user_must_change_password)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
            [
                user_id, user_username, user_fname, user_lname, email.value, passwordHash, user_phone || null,
                user_line_id || null, user_whatApp_no || null, user_role_id || null, branch.value,
            ]
        );

        res.status(201).json({ user_id, user_username, user_email: email.value, temp_password });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: duplicateMessage(err) });
        }
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const {
            user_fname, user_lname, user_phone,
            user_line_id, user_whatApp_no, user_role_id, user_status,
        } = req.body;

        if (!user_fname || !user_lname) {
            return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
        }
        // ล้างอีเมลทิ้งได้ (= ผู้ใช้จะถูกขอให้ยืนยันอีเมลใหม่ตอนเข้าระบบครั้งถัดไป)
        const email = parseEmail(req.body.user_email);
        if (email.error) return res.status(400).json({ message: email.error });
        const username = parseUsername(req.body.user_username);
        if (username.error) return res.status(400).json({ message: username.error });

        const access = await checkCanManageUser(req, req.params.id);
        if (access.notFound) return res.status(404).json({ message: "ไม่พบผู้ใช้งาน" });
        if (access.error) return sendAccessError(res, access.error);

        const newRoleId = user_role_id || null;
        const newStatus = user_status === "inactive" ? "inactive" : "active";

        // แก้ข้อมูลตัวเองผ่านหน้าจัดการผู้ใช้ได้ แต่เปลี่ยน role/สถานะของตัวเองไม่ได้ — กันมอบสิทธิ์ให้ตัวเอง
        // และกันปิดบัญชีตัวเองจนเข้าระบบไม่ได้ (risk-fixes R25)
        const isChangingOwnAccess = access.isSelf
            && (newRoleId !== (access.target.roleId ?? null) || newStatus !== access.target.status);
        if (isChangingOwnAccess) return sendAccessError(res, ACCESS_ERRORS.changeOwnAccess);

        const roleCheck = await checkCanAssignRole(req, newRoleId);
        if (roleCheck.invalid) {
            return res.status(400).json({ message: "ไม่พบสิทธิ์ (role) ที่เลือก อาจถูกลบไปแล้ว กรุณาเลือกใหม่" });
        }
        if (roleCheck.error) return sendAccessError(res, roleCheck.error);

        const [[current]] = await pool.query("SELECT user_branch_id FROM tb_users WHERE user_id = ?", [req.params.id]);
        const branch = await resolveBranchId(req.body.user_branch_id, current?.user_branch_id ?? null);
        if (branch.error) return res.status(400).json({ message: branch.error });

        await pool.query(
            `UPDATE tb_users SET
                user_username = COALESCE(?, user_username),
                user_fname = ?, user_lname = ?, user_email = ?, user_phone = ?,
                user_line_uid = ?, user_whatsapp_no = ?, user_role_id = ?, user_status = ?, user_branch_id = ?
             WHERE user_id = ?`,
            [
                username.value,
                user_fname, user_lname, email.value, user_phone || null,
                user_line_id || null, user_whatApp_no || null, newRoleId, newStatus, branch.value,
                req.params.id,
            ]
        );

        res.json({ message: "แก้ไขผู้ใช้งานสำเร็จ" });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: duplicateMessage(err) });
        }
        next(err);
    }
}

// ประวัติที่ทำให้ลบผู้ใช้ไม่ได้ (2026-10-12, risk-fixes R7/R20)
// - สามข้อแรกมี foreign key ที่ไม่ยอมให้ลบ — เดิมลบแล้วได้ error 500 ที่ไม่บอกเหตุผล
// - ที่เหลือเป็น SET NULL: ลบได้ แต่ประวัติงาน/แชท/ปัญหาจะไม่เหลือชื่อคนทำ และ KPI ย้อนหลังเพี้ยน
// ผู้ใช้ที่เคยทำงานในระบบแล้วให้ "ยกเลิกใช้งาน" แทน — ลบจริงได้เฉพาะบัญชีที่สร้างผิดและยังไม่เคยใช้งาน
const USER_HISTORY_CHECKS = [
    { label: "สร้างโปรเจกต์", unit: "โปรเจกต์", sql: "SELECT COUNT(*) AS n FROM tb_projects WHERE project_created_by = ?" },
    { label: "เป็นสมาชิก", unit: "โปรเจกต์", sql: "SELECT COUNT(*) AS n FROM tb_project_members WHERE user_id = ?" },
    { label: "สร้างสิทธิ์ (role)", unit: "รายการ", sql: "SELECT COUNT(*) AS n FROM tb_roles WHERE role_granted_by_id = ?" },
    { label: "ประวัติการทำงานในงาน", unit: "รายการ", sql: "SELECT COUNT(*) AS n FROM tb_task_activity_log WHERE user_id = ?" },
    { label: "แจ้งปัญหา", unit: "เรื่อง", sql: "SELECT COUNT(*) AS n FROM tb_task_issues WHERE created_by = ?" },
    { label: "ตอบปัญหา", unit: "ครั้ง", sql: "SELECT COUNT(*) AS n FROM tb_task_issue_replies WHERE user_id = ?" },
    { label: "ข้อความแชทในงาน", unit: "ข้อความ", sql: "SELECT COUNT(*) AS n FROM tb_task_chat_messages WHERE user_id = ?" },
    { label: "ข้อความแชทโปรเจกต์", unit: "ข้อความ", sql: "SELECT COUNT(*) AS n FROM tb_project_chat_messages WHERE user_id = ?" },
    // วงจรขาย (2026-10-13) — เอกสารขายต้องรู้เสมอว่าใครสร้าง/อนุมัติ/ยกเลิก
    {
        label: "สร้างหรืออนุมัติใบเสนอราคา",
        unit: "ใบ",
        sql: "SELECT COUNT(*) AS n FROM tb_quotations WHERE ? IN (qt_created_by, qt_approved_by, qt_cancelled_by)",
    },
    { label: "ประวัติการอนุมัติ", unit: "ครั้ง", sql: "SELECT COUNT(*) AS n FROM tb_quotation_approvals WHERE qta_user_id = ?" },
    { label: "ลายเซ็น", unit: "ฉบับ", sql: "SELECT COUNT(*) AS n FROM tb_user_signatures WHERE sig_user_id = ?" },
    // เฟส 2 (2026-10-16) — ค่าใช้จ่าย/ใบเบิกต้องรู้เสมอว่าใครบันทึก/เบิก/ยกเลิก/อนุมัติ
    {
        label: "บันทึก เบิก หรือยกเลิกค่าใช้จ่าย",
        unit: "รายการ",
        sql: "SELECT COUNT(*) AS n FROM tb_expenses WHERE ? IN (ex_created_by, ex_employee_id, ex_cancelled_by)",
    },
    { label: "อนุมัติค่าใช้จ่าย", unit: "ครั้ง", sql: "SELECT COUNT(*) AS n FROM tb_expense_approvals WHERE expa_user_id = ?" },
    {
        label: "ทำจ่าย/ยกเลิกใบสำคัญจ่าย หรือเป็นผู้รับเงิน",
        unit: "ใบ",
        sql: "SELECT COUNT(*) AS n FROM tb_payments WHERE ? IN (pv_created_by, pv_cancelled_by, pv_employee_id)",
    },
];

async function findUserHistory(userId) {
    const found = [];
    for (const check of USER_HISTORY_CHECKS) {
        const [[{ n }]] = await pool.query(check.sql, [userId]);
        if (n > 0) found.push(`${check.label} ${n} ${check.unit}`);
    }
    return found;
}

async function remove(req, res, next) {
    try {
        const userId = req.params.id;
        if (userId === req.user.user_id) {
            return res.status(409).json({
                code: "CANNOT_DELETE_SELF",
                message: "ลบบัญชีของตัวเองไม่ได้ ให้ผู้ดูแลคนอื่นเป็นคนจัดการ",
            });
        }

        const [rows] = await pool.query("SELECT user_avatar_url FROM tb_users WHERE user_id = ?", [userId]);
        const user = rows[0];
        if (!user) {
            return res.status(404).json({ message: "ไม่พบผู้ใช้นี้ อาจถูกลบไปแล้ว" });
        }

        const access = await checkCanManageUser(req, userId);
        if (access.error) return sendAccessError(res, access.error);

        const history = await findUserHistory(userId);
        if (history.length > 0) {
            return res.status(409).json({
                code: "USER_HAS_HISTORY",
                message: `ลบผู้ใช้นี้ไม่ได้ เพราะมีประวัติในระบบ (${history.join(", ")}) ` +
                    "ถ้าไม่ต้องการให้เข้าระบบแล้ว ให้แก้ไขผู้ใช้และเปลี่ยนสถานะเป็น \"ยกเลิกใช้งาน\" แทน — ประวัติและ KPI ยังอยู่ครบ",
            });
        }

        await pool.query("DELETE FROM tb_users WHERE user_id = ?", [userId]);

        // ลบไฟล์รูปโปรไฟล์ด้วย ไม่ให้ค้างใน uploads/ (ฐานข้อมูลไม่ลบไฟล์ให้)
        if (user.user_avatar_url) {
            await fs.unlink(path.join(UPLOADS_DIR, user.user_avatar_url.replace(/^\/uploads\//, ""))).catch(() => {});
        }
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

async function changeOwnPassword(req, res, next) {
    try {
        const { new_password } = req.body;
        if (!new_password || new_password.length < 8) {
            return res.status(400).json({ message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" });
        }

        const passwordHash = await bcrypt.hash(new_password, 10);
        await pool.query(
            "UPDATE tb_users SET user_password = ?, user_must_change_password = FALSE WHERE user_id = ?",
            [passwordHash, req.user.user_id]
        );

        res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });
    } catch (err) {
        next(err);
    }
}

async function resetPassword(req, res, next) {
    try {
        // รีเซ็ตรหัสผ่านของคนที่สิทธิ์สูงกว่า = ได้รหัสชั่วคราวไปเข้าระบบในชื่อเขา (risk-fixes R25)
        const access = await checkCanManageUser(req, req.params.id);
        if (access.notFound) return res.status(404).json({ message: "ไม่พบผู้ใช้งาน" });
        if (access.error) return sendAccessError(res, access.error);

        const temp_password = generateTempPassword();
        const passwordHash = await bcrypt.hash(temp_password, 10);

        const [result] = await pool.query(
            "UPDATE tb_users SET user_password = ?, user_must_change_password = TRUE WHERE user_id = ?",
            [passwordHash, req.params.id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ message: "ไม่พบผู้ใช้งาน" });

        res.json({ temp_password });
    } catch (err) {
        next(err);
    }
}

async function saveAvatarForUser(userId, file) {
    const [rows] = await pool.query("SELECT user_avatar_url FROM tb_users WHERE user_id = ?", [
        userId,
    ]);
    if (!rows[0]) {
        const err = new Error("ไม่พบผู้ใช้งาน");
        err.status = 404;
        throw err;
    }
    const oldAvatarUrl = rows[0].user_avatar_url;

    // ครอปเป็นสี่เหลี่ยม 256px แล้วบีบให้เล็กที่สุดโดยยังคมชัด (วิธีบีบดู utils/imageCompress.js)
    // แยกโฟลเดอร์ avatars/ ออกจากรูปประเภทอื่น (issue/chat) กันโฟลเดอร์ uploads/ รวมทุกอย่างปนกันจนรกตอนไฟล์เยอะขึ้น
    const { data, ext } = await compressImage(file.buffer, { square: 256 });
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
    await fs.mkdir(path.join(UPLOADS_DIR, "avatars"), { recursive: true });
    await fs.writeFile(path.join(UPLOADS_DIR, "avatars", filename), data);

    const user_avatar_url = `/uploads/avatars/${filename}`;
    await pool.query("UPDATE tb_users SET user_avatar_url = ? WHERE user_id = ?", [
        user_avatar_url,
        userId,
    ]);

    // ลบไฟล์รูปเก่าทิ้ง ไม่ให้ค้างอยู่ใน uploads/ เปล่าๆ หลังเปลี่ยนรูปใหม่
    // ใช้ path ที่เก็บไว้ตรงๆ (ตัด "/uploads/" นำหน้าออก) ไม่ใช้ path.basename เฉยๆ เพราะจะทิ้งชื่อโฟลเดอร์ย่อยไป หาไฟล์ไม่เจอ
    if (oldAvatarUrl) {
        await fs.unlink(path.join(UPLOADS_DIR, oldAvatarUrl.replace(/^\/uploads\//, ""))).catch(() => {});
    }

    return user_avatar_url;
}

async function uploadImage(req, res, next) {
    try {
        if (!req.file) return res.status(400).json({ message: "ไม่พบไฟล์รูปภาพ" });
        const access = await checkCanManageUser(req, req.params.id);
        if (access.notFound) return res.status(404).json({ message: "ไม่พบผู้ใช้งาน" });
        if (access.error) return sendAccessError(res, access.error);

        const user_avatar_url = await saveAvatarForUser(req.params.id, req.file);
        res.json({ user_avatar_url });
    } catch (err) {
        next(err);
    }
}

async function uploadMyImage(req, res, next) {
    try {
        if (!req.file) return res.status(400).json({ message: "ไม่พบไฟล์รูปภาพ" });
        const user_avatar_url = await saveAvatarForUser(req.user.user_id, req.file);
        res.json({ user_avatar_url });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    me, forSelect, getAll, getOne, create, update, remove, uploadImage, uploadMyImage,
    changeOwnPassword, resetPassword, updateMyProfile, requestMyEmailOtp, verifyMyEmailOtp,
};
