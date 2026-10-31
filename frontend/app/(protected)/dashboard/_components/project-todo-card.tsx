// สิ่งที่ต้องทำในโปรเจกต์ (2026-10-31 · docs/plans/2026-10-31-project-next-steps.md ข้อ 6.3)
// เฉพาะเรื่องเร่ง/ถึงคิวที่ผู้ใช้กดทำได้เอง (Q1) รวมทุกโปรเจกต์ · เร่งขึ้นก่อน · สูงสุด 8 เรื่อง · กฎเดียวกับกล่อง "ต่อไปต้องทำ" ในหน้าโปรเจกต์
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import type { NextStepItem } from "@/app/(protected)/projects/view/_components/next-steps-card";

export type ProjectTodo = {
    items: (NextStepItem & { project_id: string; project_name: string })[];
    total: number;
    waiting_count: number;
};

const LEVEL_DOT: Record<NextStepItem["level"], string> = {
    urgent: "bg-red-500",
    todo: "bg-blue-500",
    wait: "bg-gray-300",
    info: "bg-gray-300",
};

export default function ProjectTodoCard({ todo }: { todo: ProjectTodo }) {
    const hiddenCount = todo.total - todo.items.length;
    return (
        <section aria-labelledby="project-todo-title" className={`grid gap-3 p-5 sm:p-6 ${CARD_CLASS}`}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h2 id="project-todo-title" className="flex items-center gap-2 text-base font-medium text-gray-900">
                    <Compass size={18} className="text-blue-600" aria-hidden="true" />
                    สิ่งที่ต้องทำในโปรเจกต์
                </h2>
                <span className="text-sm text-gray-500">
                    {todo.total > 0 ? `${todo.total} เรื่องที่คุณทำได้` : "ไม่มีเรื่องค้าง"}
                </span>
            </div>
            <p className="text-xs text-gray-500">
                แดง = เลยกำหนด · ฟ้า = ถึงคิวคุณ · แสดงเฉพาะเรื่องที่สิทธิ์ของคุณกดทำได้ เปิดโปรเจกต์เพื่อดูทุกเรื่อง
            </p>

            {todo.items.length === 0 ? (
                <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
                    ไม่มีเรื่องที่ต้องทำตอนนี้
                    {todo.waiting_count > 0 && ` · รอคนอื่นหรือรอลูกค้าอยู่ ${todo.waiting_count} เรื่อง`}
                </p>
            ) : (
                <ul className="grid divide-y divide-gray-100">
                    {todo.items.map((entry) => (
                        <li
                            key={`${entry.project_id}-${entry.key}`}
                            className="grid gap-2 py-3 first:pt-1 sm:flex sm:items-center sm:justify-between sm:gap-4"
                        >
                            <div className="flex min-w-0 gap-2.5">
                                <span
                                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[entry.level]}`}
                                    aria-hidden="true"
                                />
                                <div className="grid min-w-0 gap-0.5">
                                    <Link
                                        href={`/projects/view?id=${encodeURIComponent(entry.project_id)}`}
                                        className="truncate text-xs text-gray-500 hover:text-blue-600 hover:underline"
                                    >
                                        {entry.project_name}
                                    </Link>
                                    <span className="wrap-break-word text-sm text-gray-900">{entry.title}</span>
                                    {entry.reason && (
                                        <span className="wrap-break-word text-xs text-gray-500">{entry.reason}</span>
                                    )}
                                </div>
                            </div>
                            {entry.action && (
                                <Link
                                    href={entry.action.href}
                                    className={buttonClass(
                                        "secondary",
                                        "sm",
                                        "w-full shrink-0 justify-center sm:w-auto",
                                    )}
                                >
                                    {entry.action.label}
                                    <ArrowRight size={14} aria-hidden="true" />
                                </Link>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {hiddenCount > 0 && (
                <Link href="/projects" className="justify-self-start py-2 text-sm text-blue-600 hover:underline">
                    ยังมีอีก {hiddenCount} เรื่อง · ดูในรายการโปรเจกต์
                </Link>
            )}
        </section>
    );
}
