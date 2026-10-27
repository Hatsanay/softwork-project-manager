// คำตอบความต้องการของคำขอ (2026-10-25 · S-2) — ใช้ทั้งหน้าสถานะของลูกค้าและหน้าคำขอของพนักงาน
// เรียงตามที่ถาม แบ่งตามกลุ่ม · ข้อที่ไม่ได้ตอบแสดง "-" · ไฟล์: พนักงานกดเปิดได้ (onOpenFile) ลูกค้าเห็นชื่อไฟล์
// ไฟล์งานออกแบบ (is_viewable = false) บอกว่า "ดาวน์โหลด" ให้รู้ก่อนกดว่าไม่เปิดในแท็บ
import { Download, FileText } from "lucide-react";
import type { RequestAnswer } from "../_types";

type AnswerFile = RequestAnswer["files"][number];

export default function AnswersList({ answers, onOpenFile }: { answers: RequestAnswer[]; onOpenFile?: (file: AnswerFile) => void }) {
    const groups: { name: string; answers: RequestAnswer[] }[] = [];
    for (const answer of answers) {
        const last = groups.at(-1);
        if (last && last.name === answer.group_name) last.answers.push(answer);
        else groups.push({ name: answer.group_name, answers: [answer] });
    }
    return (
        <div className="grid gap-4">
            {groups.map((group, groupIndex) => (
                <section key={`${group.name}-${groupIndex}`} className="grid gap-2">
                    <h3 className="text-sm font-medium text-blue-700">{group.name}</h3>
                    <dl className="grid gap-2.5">
                        {group.answers.map((answer, index) => (
                            <div key={index} className="grid gap-0.5 border-b border-gray-100 pb-2 last:border-b-0">
                                <dt className="text-xs text-gray-500">{answer.question}</dt>
                                <dd className="text-sm whitespace-pre-line wrap-break-word text-gray-900">
                                    {answer.type === "file" ? (
                                        answer.files.length === 0 ? (
                                            "-"
                                        ) : (
                                            <ul className="grid gap-1">
                                                {answer.files.map((file) => (
                                                    <li key={file.id}>
                                                        {onOpenFile ? (
                                                            <button type="button" className="-my-1.5 inline-flex min-h-9 items-center gap-1.5 text-blue-600 hover:underline" onClick={() => onOpenFile(file)}>
                                                                {file.is_viewable ? <FileText size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
                                                                {file.name}
                                                                {!file.is_viewable && <span className="text-xs text-gray-500">(ดาวน์โหลด)</span>}
                                                            </button>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 text-gray-700">
                                                                <FileText size={15} aria-hidden="true" />
                                                                {file.name}
                                                            </span>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        )
                                    ) : (
                                        answer.answer || "-"
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>
            ))}
        </div>
    );
}
