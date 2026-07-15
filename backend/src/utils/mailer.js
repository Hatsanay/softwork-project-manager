const nodemailer = require("nodemailer");

const TASK_STATUS_LABEL = { todo: "รอดำเนินการ", in_progress: "กำลังทำ", review: "ตรวจสอบ", done: "เสร็จแล้ว" };
const TASK_STATUS_COLOR = { todo: "#6b7280", in_progress: "#2554c7", review: "#b45309", done: "#15803d" };
const TASK_STATUS_BG = { todo: "#f3f4f6", in_progress: "#eaf0fd", review: "#fef3e2", done: "#e9f8ef" };

let transporter = null;

// สร้าง transporter แบบ lazy — ถ้ายังไม่ตั้งค่า SMTP_USER/SMTP_PASS ใน .env จะ return null
// และฟังก์ชันส่งอีเมลจะแค่ log เตือนแล้วข้ามไป ไม่ทำให้ระบบพัง
function getTransporter() {
    if (transporter) return transporter;
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;

    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    return transporter;
}

function formatDateTh(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "2-digit", timeZone: "Asia/Bangkok" });
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildTaskAssignedEmail({
    taskTitle, taskDescription, taskStatus, projectName, assignerName,
    startDate, dueDate, actionUrl,
}) {
    const statusLabel = TASK_STATUS_LABEL[taskStatus] ?? taskStatus;
    const statusColor = TASK_STATUS_COLOR[taskStatus] ?? "#6b7280";
    const statusBg = TASK_STATUS_BG[taskStatus] ?? "#f3f4f6";
    const title = escapeHtml(taskTitle);
    const project = escapeHtml(projectName);
    const assigner = escapeHtml(assignerName);
    const url = escapeHtml(actionUrl);

    const descriptionBlock = taskDescription
        ? `<tr><td style="padding:0 0 28px;">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf0fd;border-radius:0 8px 8px 0;border-left:3px solid #2554c7;">
               <tr><td style="padding:14px 18px;">
                 <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#1a3a94;font-family:'Segoe UI',Arial,sans-serif;">รายละเอียดงาน</p>
                 <p style="margin:0;font-size:14px;line-height:1.7;color:#4b5568;font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(taskDescription)}</p>
               </td></tr>
             </table>
           </td></tr>`
        : "";

    const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>คุณได้รับมอบหมายงาน: ${title}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f7;font-family:'Segoe UI',Arial,'Noto Sans Thai',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">โปรเจกต์ ${project} · ครบกำหนด ${formatDateTh(dueDate)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e3e7f0;border-radius:14px;overflow:hidden;">

        <tr><td style="padding:26px 32px 20px;border-bottom:1px solid #e3e7f0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:26px;height:26px;background:#2554c7;border-radius:7px;" width="26" height="26"></td>
            <td style="padding-left:10px;font-size:14px;font-weight:600;color:#10192e;">Softwork Project Manager <span style="color:#8b93a7;font-weight:400;">· แจ้งเตือนงาน</span></td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:32px;">
          <p style="margin:0 0 10px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#2554c7;">มอบหมายงานใหม่</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;"><tr>
            <td style="font-size:22px;line-height:1.35;font-weight:700;color:#10192e;">${title}</td>
            <td align="right" valign="top" style="white-space:nowrap;padding-left:16px;">
              <span style="display:inline-block;padding:6px 12px;border-radius:100px;background:${statusBg};color:${statusColor};font-size:12px;font-weight:600;">${escapeHtml(statusLabel)}</span>
            </td>
          </tr></table>

          <p style="margin:0 0 26px;font-size:15px;line-height:1.7;color:#4b5568;">
            <b style="color:#10192e;">${assigner}</b> มอบหมายงานนี้ให้คุณ ในโปรเจกต์ <b style="color:#10192e;">${project}</b>
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7;border:1px solid #e3e7f0;border-radius:10px;margin-bottom:24px;">
            <tr>
              <td style="padding:20px 22px 10px;width:50%;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b93a7;">โปรเจกต์</p>
                <p style="margin:0;font-size:14.5px;font-weight:500;color:#10192e;">${project}</p>
              </td>
              <td style="padding:20px 22px 10px;width:50%;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b93a7;">มอบหมายโดย</p>
                <p style="margin:0;font-size:14.5px;font-weight:500;color:#10192e;">${assigner}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 22px 20px;width:50%;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b93a7;">วันเริ่ม</p>
                <p style="margin:0;font-size:14.5px;font-weight:500;color:#10192e;">${formatDateTh(startDate)}</p>
              </td>
              <td style="padding:10px 22px 20px;width:50%;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b93a7;">ครบกำหนด</p>
                <p style="margin:0;font-size:14.5px;font-weight:500;color:#10192e;">${formatDateTh(dueDate)}</p>
              </td>
            </tr>
          </table>

          ${descriptionBlock}

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:14px;">
            <a href="${url}" style="display:inline-block;background:#2554c7;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 34px;border-radius:8px;">ดูรายละเอียดงาน</a>
          </td></tr></table>
          <p style="text-align:center;font-size:12px;color:#8b93a7;margin:0;word-break:break-all;">
            หากปุ่มด้านบนใช้งานไม่ได้ ให้เปิดลิงก์นี้แทน:<br />
            <a href="${url}" style="color:#2554c7;text-decoration:none;">${url}</a>
          </p>
        </td></tr>

        <tr><td style="border-top:1px solid #e3e7f0;padding:20px 32px 26px;font-size:12px;line-height:1.7;color:#8b93a7;">
          อีเมลนี้ส่งอัตโนมัติจากระบบ <strong style="color:#4b5568;">Softwork Project Manager</strong> เมื่อคุณถูกมอบหมายงานใหม่
          หากคิดว่าได้รับอีเมลนี้ผิดพลาด กรุณาแจ้งผู้ดูแลระบบของทีมคุณ
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = [
        `คุณได้รับมอบหมายงาน: ${taskTitle}`,
        `โปรเจกต์: ${projectName}`,
        `มอบหมายโดย: ${assignerName}`,
        `สถานะ: ${statusLabel}`,
        `วันเริ่ม: ${formatDateTh(startDate)}`,
        `ครบกำหนด: ${formatDateTh(dueDate)}`,
        taskDescription ? `รายละเอียด: ${taskDescription}` : null,
        `ดูรายละเอียดงาน: ${actionUrl}`,
    ].filter(Boolean).join("\n");

    return { html, text };
}

function buildProjectMemberAddedEmail({ projectName, adderName, positionNames, actionUrl }) {
    const project = escapeHtml(projectName);
    const adder = escapeHtml(adderName);
    const url = escapeHtml(actionUrl);
    const positionsLabel = positionNames && positionNames.length ? positionNames.join(", ") : "-";

    const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>คุณถูกเพิ่มเป็นสมาชิกโปรเจกต์: ${project}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f7;font-family:'Segoe UI',Arial,'Noto Sans Thai',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">คุณถูกเพิ่มเป็นสมาชิกในโปรเจกต์ ${project}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e3e7f0;border-radius:14px;overflow:hidden;">

        <tr><td style="padding:26px 32px 20px;border-bottom:1px solid #e3e7f0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:26px;height:26px;background:#2554c7;border-radius:7px;" width="26" height="26"></td>
            <td style="padding-left:10px;font-size:14px;font-weight:600;color:#10192e;">Softwork Project Manager <span style="color:#8b93a7;font-weight:400;">· แจ้งเตือนโปรเจกต์</span></td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:32px;">
          <p style="margin:0 0 10px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#2554c7;">เพิ่มเป็นสมาชิกโปรเจกต์ใหม่</p>

          <p style="margin:0 0 22px;font-size:22px;line-height:1.35;font-weight:700;color:#10192e;">${project}</p>

          <p style="margin:0 0 26px;font-size:15px;line-height:1.7;color:#4b5568;">
            <b style="color:#10192e;">${adder}</b> เพิ่มคุณเป็นสมาชิกในโปรเจกต์นี้แล้ว
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7;border:1px solid #e3e7f0;border-radius:10px;margin-bottom:24px;">
            <tr>
              <td style="padding:20px 22px;width:50%;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b93a7;">เพิ่มโดย</p>
                <p style="margin:0;font-size:14.5px;font-weight:500;color:#10192e;">${adder}</p>
              </td>
              <td style="padding:20px 22px;width:50%;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b93a7;">ตำแหน่งของคุณ</p>
                <p style="margin:0;font-size:14.5px;font-weight:500;color:#10192e;">${escapeHtml(positionsLabel)}</p>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:14px;">
            <a href="${url}" style="display:inline-block;background:#2554c7;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 34px;border-radius:8px;">ดูโปรเจกต์</a>
          </td></tr></table>
          <p style="text-align:center;font-size:12px;color:#8b93a7;margin:0;word-break:break-all;">
            หากปุ่มด้านบนใช้งานไม่ได้ ให้เปิดลิงก์นี้แทน:<br />
            <a href="${url}" style="color:#2554c7;text-decoration:none;">${url}</a>
          </p>
        </td></tr>

        <tr><td style="border-top:1px solid #e3e7f0;padding:20px 32px 26px;font-size:12px;line-height:1.7;color:#8b93a7;">
          อีเมลนี้ส่งอัตโนมัติจากระบบ <strong style="color:#4b5568;">Softwork Project Manager</strong> เมื่อคุณถูกเพิ่มเป็นสมาชิกโปรเจกต์ใหม่
          หากคิดว่าได้รับอีเมลนี้ผิดพลาด กรุณาแจ้งผู้ดูแลระบบของทีมคุณ
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = [
        `คุณถูกเพิ่มเป็นสมาชิกโปรเจกต์: ${projectName}`,
        `เพิ่มโดย: ${adderName}`,
        `ตำแหน่งของคุณ: ${positionsLabel}`,
        `ดูโปรเจกต์: ${actionUrl}`,
    ].join("\n");

    return { html, text };
}

function buildClientShareLinkEmail({ clientName, projectName, senderName, message, progressPercent, dueDate, shareUrl }) {
    const client = escapeHtml(clientName || "ลูกค้า");
    const project = escapeHtml(projectName);
    const sender = escapeHtml(senderName);
    const url = escapeHtml(shareUrl);
    const percent = Math.max(0, Math.min(100, Math.round(Number(progressPercent) || 0)));

    const messageBlock = message
        ? `<tr><td style="padding:0 0 28px;">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf0fd;border-radius:0 8px 8px 0;border-left:3px solid #2554c7;">
               <tr><td style="padding:14px 18px;">
                 <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#1a3a94;font-family:'Segoe UI',Arial,sans-serif;">ข้อความจากทีมงาน</p>
                 <p style="margin:0;font-size:14px;line-height:1.7;color:#4b5568;font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(message)}</p>
               </td></tr>
             </table>
           </td></tr>`
        : "";

    const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>อัปเดตความคืบหน้าโปรเจกต์: ${project}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f7;font-family:'Segoe UI',Arial,'Noto Sans Thai',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">ลิงก์ติดตามความคืบหน้าโปรเจกต์ ${project} · ความคืบหน้า ${percent}%</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e3e7f0;border-radius:14px;overflow:hidden;">

        <tr><td style="padding:26px 32px 20px;border-bottom:1px solid #e3e7f0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:26px;height:26px;background:#2554c7;border-radius:7px;" width="26" height="26"></td>
            <td style="padding-left:10px;font-size:14px;font-weight:600;color:#10192e;">Softwork Project Manager <span style="color:#8b93a7;font-weight:400;">· อัปเดตโปรเจกต์</span></td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:32px;">
          <p style="margin:0 0 10px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#2554c7;">ลิงก์ติดตามความคืบหน้าโปรเจกต์</p>

          <p style="margin:0 0 10px;font-size:22px;line-height:1.35;font-weight:700;color:#10192e;">${project}</p>

          <p style="margin:0 0 26px;font-size:15px;line-height:1.7;color:#4b5568;">
            เรียนคุณ<b style="color:#10192e;">${client}</b><br />
            <b style="color:#10192e;">${sender}</b> ส่งลิงก์สำหรับติดตามความคืบหน้าโปรเจกต์นี้ให้คุณ สามารถเปิดดูได้ทันทีโดยไม่ต้องเข้าสู่ระบบ
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7;border:1px solid #e3e7f0;border-radius:10px;margin-bottom:24px;">
            <tr>
              <td style="padding:20px 22px 12px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b93a7;">ความคืบหน้า</td>
                  <td align="right" style="font-size:13px;font-weight:700;color:#2554c7;">${percent}%</td>
                </tr></table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr>
                  <td width="${percent}%" style="height:8px;line-height:8px;font-size:0;background:#2554c7;border-radius:100px 0 0 100px;">&nbsp;</td>
                  <td width="${100 - percent}%" style="height:8px;line-height:8px;font-size:0;background:#d7deed;border-radius:0 100px 100px 0;">&nbsp;</td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 22px 18px;width:50%;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b93a7;">ครบกำหนด</p>
                <p style="margin:0;font-size:14.5px;font-weight:500;color:#10192e;">${formatDateTh(dueDate)}</p>
              </td>
            </tr>
          </table>

          ${messageBlock}

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:14px;">
            <a href="${url}" style="display:inline-block;background:#2554c7;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 34px;border-radius:8px;">ดูความคืบหน้าโปรเจกต์</a>
          </td></tr></table>
          <p style="text-align:center;font-size:12px;color:#8b93a7;margin:0;word-break:break-all;">
            หากปุ่มด้านบนใช้งานไม่ได้ ให้เปิดลิงก์นี้แทน:<br />
            <a href="${url}" style="color:#2554c7;text-decoration:none;">${url}</a>
          </p>
        </td></tr>

        <tr><td style="border-top:1px solid #e3e7f0;padding:20px 32px 26px;font-size:12px;line-height:1.7;color:#8b93a7;">
          อีเมลนี้ส่งโดย <strong style="color:#4b5568;">${sender}</strong> ผ่านระบบ <strong style="color:#4b5568;">Softwork Project Manager</strong>
          ลิงก์นี้เป็นลิงก์แบบดูอย่างเดียว ไม่ต้องเข้าสู่ระบบ หากคิดว่าได้รับอีเมลนี้ผิดพลาด กรุณาแจ้งผู้ส่งโดยตรง
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = [
        `อัปเดตความคืบหน้าโปรเจกต์: ${projectName}`,
        `เรียนคุณ${clientName || "ลูกค้า"}`,
        `${senderName} ส่งลิงก์สำหรับติดตามความคืบหน้าโปรเจกต์นี้ให้คุณ`,
        `ความคืบหน้า: ${percent}%`,
        `ครบกำหนด: ${formatDateTh(dueDate)}`,
        message ? `ข้อความจากทีมงาน: ${message}` : null,
        `ดูความคืบหน้าโปรเจกต์: ${shareUrl}`,
    ].filter(Boolean).join("\n");

    return { html, text };
}

// ส่งแบบ fire-and-forget เสมอ — เรียกแล้วไม่ต้อง await ใน caller (หรือ await ก็ได้แต่ error จะไม่ throw ออกไป)
// ป้องกันไม่ให้อีเมลส่งพังแล้วดึงให้ธุรกรรมหลัก (สร้าง/แก้ไข task) ล้มเหลวไปด้วย
async function sendTaskAssignedEmail({ to, ...data }) {
    try {
        const t = getTransporter();
        if (!t) {
            console.warn("[mailer] SMTP ยังไม่ได้ตั้งค่า (.env) — ข้ามการส่งอีเมลแจ้งมอบหมายงาน");
            return;
        }
        const { html, text } = buildTaskAssignedEmail(data);
        await t.sendMail({
            from: `"${process.env.SMTP_FROM_NAME || "Softwork Project Manager"}" <${process.env.SMTP_USER}>`,
            to,
            subject: `คุณได้รับมอบหมายงาน: ${data.taskTitle}`,
            html,
            text,
        });
    } catch (err) {
        console.error("[mailer] ส่งอีเมลแจ้งมอบหมายงานไม่สำเร็จ:", err.message);
    }
}

async function sendProjectMemberAddedEmail({ to, ...data }) {
    try {
        const t = getTransporter();
        if (!t) {
            console.warn("[mailer] SMTP ยังไม่ได้ตั้งค่า (.env) — ข้ามการส่งอีเมลแจ้งเพิ่มสมาชิกโปรเจกต์");
            return;
        }
        const { html, text } = buildProjectMemberAddedEmail(data);
        await t.sendMail({
            from: `"${process.env.SMTP_FROM_NAME || "Softwork Project Manager"}" <${process.env.SMTP_USER}>`,
            to,
            subject: `คุณถูกเพิ่มเป็นสมาชิกโปรเจกต์: ${data.projectName}`,
            html,
            text,
        });
    } catch (err) {
        console.error("[mailer] ส่งอีเมลแจ้งเพิ่มสมาชิกโปรเจกต์ไม่สำเร็จ:", err.message);
    }
}

// ต่างจากสองฟังก์ชันด้านบน — นี่คือการกดปุ่ม "ส่ง" ตรงๆ ของผู้ใช้ ต้องรอผลจริงและแจ้ง error กลับไปได้
// จึง throw แทนที่จะกลืน error ไว้เอง ให้ controller เป็นคนตัดสินใจว่าจะตอบ response ยังไง
async function sendClientShareLinkEmail({ to, ...data }) {
    const t = getTransporter();
    if (!t) {
        throw new Error("SMTP_NOT_CONFIGURED");
    }
    const { html, text } = buildClientShareLinkEmail(data);
    await t.sendMail({
        from: `"${process.env.SMTP_FROM_NAME || "Softwork Project Manager"}" <${process.env.SMTP_USER}>`,
        to,
        subject: `อัปเดตความคืบหน้าโปรเจกต์: ${data.projectName}`,
        html,
        text,
    });
}

module.exports = { sendTaskAssignedEmail, sendProjectMemberAddedEmail, sendClientShareLinkEmail };
