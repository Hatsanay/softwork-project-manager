"use client";

// เพิ่มสมาชิกโปรเจกต์ / แก้ตำแหน่งของสมาชิก (แยกจาก page.tsx 2026-10-30 · ส่วน C) · member = null คือเพิ่มใหม่
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { api } from "@/app/constans";
import Button from "@/components/ui/Button/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { buttonClass } from "@/components/ui/button";
import { authHeader, loadUserOptions } from "../_lib/view-helpers";
import type { Member, MemberFormState, PositionOption } from "../_types";

export default function MemberModal({
    projectId,
    member,
    members,
    positions,
    onSaved,
    onClose,
}: {
    projectId: string;
    member: Member | null;
    members: Member[];
    positions: PositionOption[];
    onSaved: () => Promise<unknown>;
    onClose: () => void;
}) {
    const [isPending, startTransition] = useTransition();
    const [memberForm, setMemberForm] = useState<MemberFormState>(
        member
            ? { user_id: member.user_id, position_ids: member.positions.map((position) => position.position_id) }
            : { user_id: "", position_ids: [] },
    );
    const [memberFormError, setMemberFormError] = useState<string | null>(null);

    function toggleMemberPosition(positionId: string) {
        setMemberForm((prev) => ({
            ...prev,
            position_ids: prev.position_ids.includes(positionId)
                ? prev.position_ids.filter((p) => p !== positionId)
                : [...prev.position_ids, positionId],
        }));
    }

    function handleMemberSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!member && !memberForm.user_id) {
            setMemberFormError("กรุณาเลือกผู้ใช้งาน");
            return;
        }
        setMemberFormError(null);

        startTransition(async () => {
            const res = member
                ? await fetch(`${api}/projects/${projectId}/members/${member.project_member_id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json", ...authHeader() },
                      body: JSON.stringify({ position_ids: memberForm.position_ids }),
                  })
                : await fetch(`${api}/projects/${projectId}/members`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", ...authHeader() },
                      body: JSON.stringify(memberForm),
                  });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMemberFormError(data.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
                return;
            }

            toast.success(member ? "แก้ไขตำแหน่งสำเร็จ" : "เพิ่มสมาชิกสำเร็จ");
            onClose();
            await onSaved();
        });
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => onClose()}
        >
            <div
                className="bg-white rounded-t-2xl sm:rounded-2xl shadow-float w-full max-w-2xl p-6 space-y-4 max-h-[90dvh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-base font-medium text-gray-900">{member ? "แก้ไขตำแหน่งสมาชิก" : "เพิ่มสมาชิก"}</h2>
                <form onSubmit={handleMemberSubmit} className="space-y-4">
                    {member ? (
                        <p className="text-sm text-gray-600">
                            ผู้ใช้งาน: <span className="font-medium">{member.user_fullname}</span>
                        </p>
                    ) : (
                        <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-gray-700 mb-1">ผู้ใช้งาน</label>
                            <SearchableSelect
                                loadOptions={(search) =>
                                    loadUserOptions(
                                        search,
                                        members.map((m) => m.user_id),
                                    )
                                }
                                value={memberForm.user_id}
                                onChange={(v) => setMemberForm((p) => ({ ...p, user_id: v }))}
                                placeholder="เลือกผู้ใช้งาน"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">ตำแหน่งในโปรเจกต์นี้</label>
                        <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                            {positions.map((pos) => (
                                <label
                                    key={pos.position_id}
                                    className="flex items-center gap-3 cursor-pointer px-4 py-2.5 hover:bg-blue-50"
                                >
                                    <input
                                        type="checkbox"
                                        checked={memberForm.position_ids.includes(pos.position_id)}
                                        onChange={() => toggleMemberPosition(pos.position_id)}
                                        className="w-4 h-4 accent-blue-500"
                                    />
                                    <span className="text-sm text-gray-700">{pos.position_name}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {memberFormError && <p className="text-sm text-red-600">{memberFormError}</p>}

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => onClose()} className={buttonClass("secondary", "md")}>
                            ยกเลิก
                        </button>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? "กำลังบันทึก..." : "บันทึก"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
