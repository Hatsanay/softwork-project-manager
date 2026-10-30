"use client";

// ปัญหาของงาน (ในหน้าต่างรายละเอียดงาน · แยกจาก page.tsx 2026-10-30 · ส่วน C)
// รายการปัญหา · ฟอร์มเพิ่ม/แก้พร้อมรูปและแท็กคน (@) · ตอบกลับพร้อมรูป · เปลี่ยนสถานะ · ลบ · สิทธิ์คิดจากงานนี้ที่หน้าส่งมา
// โหลดปัญหาและคำตอบเองเมื่อเปิด (key = งาน) · เปิด/ปิด/ลบปัญหาที่เปิดอยู่ = onCountsChanged ให้หน้าโหลดตัวเลขปัญหาของงานใหม่
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { api } from "@/app/constans";
import formatDate from "@/app/function";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import StatusPill from "@/components/ui/status-pill";
import { inputClass } from "@/components/ui/form-field";
import {
    authHeader,
    EMPTY_ISSUE_FORM,
    ISSUE_STATUS_LABEL,
    MAX_ISSUE_IMAGES,
    MAX_ISSUE_REPLY_IMAGES,
    SERVER_BASE,
} from "../_lib/view-helpers";
import type { Issue, IssueFormState, IssueReply, IssueStatus, IssueTag, TaskDetail } from "../_types";

export default function TaskIssuesSection({
    projectId,
    task,
    canAdd,
    canEdit,
    canDelete,
    canChangeStatus,
    onCountsChanged,
}: {
    projectId: string;
    task: TaskDetail;
    canAdd: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canChangeStatus: boolean;
    onCountsChanged: () => Promise<unknown>;
}) {
    const [detailIssues, setDetailIssues] = useState<Issue[]>([]);
    const [issueFormOpen, setIssueFormOpen] = useState(false);
    const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
    const [issueForm, setIssueForm] = useState<IssueFormState>(EMPTY_ISSUE_FORM);
    const [issueFormError, setIssueFormError] = useState<string | null>(null);
    const [issueKeepImageIds, setIssueKeepImageIds] = useState<string[]>([]);
    const [issueNewImages, setIssueNewImages] = useState<File[]>([]);
    const [issueTagQuery, setIssueTagQuery] = useState("");
    const [issueTagResults, setIssueTagResults] = useState<IssueTag[]>([]);
    const [issueTagDropdownOpen, setIssueTagDropdownOpen] = useState(false);
    const issueTagBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [issueRepliesByIssue, setIssueRepliesByIssue] = useState<Record<string, IssueReply[]>>({});
    const [issueRepliesLoading, setIssueRepliesLoading] = useState(true);
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
    const [replyNewImagesByIssue, setReplyNewImagesByIssue] = useState<Record<string, File[]>>({});
    const [isSendingReply, setIsSendingReply] = useState(false);
    const [isSavingIssue, setIsSavingIssue] = useState(false);
    const [deleteIssueTarget, setDeleteIssueTarget] = useState<Issue | null>(null);
    const [isDeletingIssue, setIsDeletingIssue] = useState(false);

    async function loadIssues(taskId: string) {
        const res = await fetch(`${api}/projects/${projectId}/tasks/${taskId}/issues`, { headers: authHeader() });
        if (!res.ok) return;
        const data = await res.json();
        setDetailIssues(data.data ?? []);
    }

    async function loadAllIssueReplies(taskId: string) {
        const res = await fetch(`${api}/projects/${projectId}/tasks/${taskId}/issues/replies`, {
            headers: authHeader(),
        });
        if (!res.ok) return;
        const data = await res.json();
        setIssueRepliesByIssue(data.data ?? {});
    }

    async function loadIssueReplies(issueId: string) {
        const res = await fetch(`${api}/projects/${projectId}/issues/${issueId}/replies`, { headers: authHeader() });
        if (!res.ok) return;
        const data = await res.json();
        setIssueRepliesByIssue((prev) => ({ ...prev, [issueId]: data.data ?? [] }));
    }

    function handlePickReplyImages(issueId: string, files: FileList | null) {
        if (!files) return;
        const picked = Array.from(files);
        const current = replyNewImagesByIssue[issueId] ?? [];
        const remaining = MAX_ISSUE_REPLY_IMAGES - current.length;
        if (remaining <= 0) {
            toast.error(`แนบรูปได้สูงสุด ${MAX_ISSUE_REPLY_IMAGES} รูปต่อการตอบกลับ`);
            return;
        }
        setReplyNewImagesByIssue((prev) => ({ ...prev, [issueId]: [...current, ...picked.slice(0, remaining)] }));
    }

    async function handleSendReply(e: React.FormEvent<HTMLFormElement>, issueId: string) {
        e.preventDefault();
        const text = (replyDrafts[issueId] ?? "").trim();
        const images = replyNewImagesByIssue[issueId] ?? [];
        if (!text && images.length === 0) return;

        setIsSendingReply(true);
        try {
            const fd = new FormData();
            if (text) fd.append("reply_text", text);
            for (const file of images) fd.append("images", file);

            const res = await fetch(`${api}/projects/${projectId}/issues/${issueId}/replies`, {
                method: "POST",
                headers: authHeader(),
                body: fd,
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message ?? "ส่งข้อความตอบกลับไม่สำเร็จ");
                return;
            }
            setReplyDrafts((prev) => ({ ...prev, [issueId]: "" }));
            setReplyNewImagesByIssue((prev) => ({ ...prev, [issueId]: [] }));
            await loadIssueReplies(issueId);
        } finally {
            setIsSendingReply(false);
        }
    }

    function openAddIssue() {
        setEditingIssue(null);
        setIssueForm(EMPTY_ISSUE_FORM);
        setIssueFormError(null);
        setIssueKeepImageIds([]);
        setIssueNewImages([]);
        setIssueTagQuery("");
        setIssueTagResults([]);
        setIssueFormOpen(true);
    }

    function openEditIssue(issue: Issue) {
        setEditingIssue(issue);
        setIssueForm({
            issue_title: issue.issue_title,
            issue_description: issue.issue_description ?? "",
            tagged_users: issue.tags,
        });
        setIssueFormError(null);
        setIssueKeepImageIds(issue.images.map((img) => img.image_id));
        setIssueNewImages([]);
        setIssueTagQuery("");
        setIssueTagResults([]);
        setIssueFormOpen(true);
    }

    function totalIssueImageCount() {
        return issueKeepImageIds.length + issueNewImages.length;
    }

    function handlePickIssueImages(files: FileList | null) {
        if (!files) return;
        // ต้องแปลงเป็น array ตรงนี้ทันที (ไม่ใช่ในตัว updater ของ setState) เพราะ caller จะเคลียร์
        // e.target.value = "" ทันทีหลังเรียกฟังก์ชันนี้ ถ้ายังอ้าง FileList เดิมอยู่ตอน React ค่อยรัน
        // updater จริง จะได้ FileList ว่างเปล่าไปแทน (input ถูกเคลียร์ไปแล้ว)
        const picked = Array.from(files);
        const remaining = MAX_ISSUE_IMAGES - totalIssueImageCount();
        if (remaining <= 0) {
            toast.error(`แนบรูปได้สูงสุด ${MAX_ISSUE_IMAGES} รูปต่อปัญหา`);
            return;
        }
        setIssueNewImages((prev) => [...prev, ...picked.slice(0, remaining)]);
    }

    async function handleIssueSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!issueForm.issue_title.trim()) {
            setIssueFormError("กรุณากรอกชื่อปัญหา");
            return;
        }

        setIsSavingIssue(true);
        try {
            const url = editingIssue
                ? `${api}/projects/${projectId}/issues/${editingIssue.issue_id}`
                : `${api}/projects/${projectId}/tasks/${task.task_id}/issues`;
            const fd = new FormData();
            fd.append("issue_title", issueForm.issue_title.trim());
            fd.append("issue_description", issueForm.issue_description.trim());
            fd.append("tagged_user_ids", JSON.stringify(issueForm.tagged_users.map((u) => u.user_id)));
            if (editingIssue) fd.append("keep_image_ids", JSON.stringify(issueKeepImageIds));
            for (const file of issueNewImages) fd.append("images", file);

            const res = await fetch(url, {
                method: editingIssue ? "PUT" : "POST",
                headers: authHeader(),
                body: fd,
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setIssueFormError(data.message ?? "บันทึกไม่สำเร็จ");
                return;
            }
            toast.success(editingIssue ? "แก้ไขปัญหาสำเร็จ" : "เพิ่มปัญหาสำเร็จ");
            setIssueFormOpen(false);
            await loadIssues(task.task_id);
        } finally {
            setIsSavingIssue(false);
        }
    }

    async function handleToggleIssueStatus(issue: Issue) {
        const issue_status: IssueStatus = issue.issue_status === "open" ? "resolved" : "open";
        const res = await fetch(`${api}/projects/${projectId}/issues/${issue.issue_id}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeader() },
            body: JSON.stringify({ issue_status }),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            toast.error(data.message ?? "เปลี่ยนสถานะไม่สำเร็จ");
            return;
        }
        await loadIssues(task.task_id);
        // ใช้ loadAll แทนการ patch tasks state เอง เพราะถ้า detailTask เป็น subtask ต้องอัปเดต
        // subtask_open_issue_count ของ task แม่ในตารางหลักด้วย ไม่ใช่แค่ open_issue_count ของตัวมันเอง
        await onCountsChanged();
    }

    async function handleDeleteIssue() {
        if (!deleteIssueTarget) return;
        setIsDeletingIssue(true);
        try {
            const res = await fetch(`${api}/projects/${projectId}/issues/${deleteIssueTarget.issue_id}`, {
                method: "DELETE",
                headers: authHeader(),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message ?? "ลบไม่สำเร็จ");
                return;
            }
            toast.success("ลบปัญหาสำเร็จ");
            await loadIssues(task.task_id);
            // เหมือน handleToggleIssueStatus — ใช้ loadAll เพราะอาจต้องอัปเดต subtask_open_issue_count ของ task แม่ด้วย
            if (deleteIssueTarget.issue_status === "open") await onCountsChanged();
        } finally {
            setIsDeletingIssue(false);
            setDeleteIssueTarget(null);
        }
    }

    // เปิดงาน: โหลดปัญหาและคำตอบทั้งหมดของงานนี้ (ผ่าน timer ไม่ setState ตรงๆ ในตัว effect)
    useEffect(() => {
        const firstLoad = setTimeout(async () => {
            await Promise.all([loadIssues(task.task_id), loadAllIssueReplies(task.task_id)]);
            setIssueRepliesLoading(false);
        }, 0);
        return () => clearTimeout(firstLoad);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [task.task_id]);

    // ค้นหาคนไว้แท็ก (@) ในฟอร์มปัญหา — debounce เหมือน dashboard search, ตัด "@" นำหน้าออกก่อนค้นหา
    useEffect(() => {
        if (!issueFormOpen) return;
        const q = issueTagQuery.trim().replace(/^@/, "");
        const timer = setTimeout(async () => {
            if (!q) {
                setIssueTagResults([]);
                return;
            }
            const res = await fetch(`${api}/users/for-select?${new URLSearchParams({ search: q })}`, {
                headers: authHeader(),
            });
            if (!res.ok) return;
            const rows = (await res.json()) as IssueTag[];
            const excludeIds = issueForm.tagged_users.map((u) => u.user_id);
            setIssueTagResults(rows.filter((u) => !excludeIds.includes(u.user_id)));
        }, 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [issueTagQuery, issueFormOpen]);

    return (
        <>
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-900">ปัญหา</h3>
                    {canAdd && !issueFormOpen && (
                        <button type="button" onClick={openAddIssue} className="text-xs text-blue-600 hover:underline">
                            + แจ้งปัญหา
                        </button>
                    )}
                </div>

                {issueFormOpen && (
                    <form
                        onSubmit={handleIssueSubmit}
                        className="space-y-2 bg-gray-50 border border-gray-100 rounded-lg p-3"
                    >
                        <Input
                            value={issueForm.issue_title}
                            onChange={(e) => setIssueForm((p) => ({ ...p, issue_title: e.target.value }))}
                            placeholder="ชื่อปัญหา"
                            required
                        />
                        <textarea
                            value={issueForm.issue_description}
                            onChange={(e) => setIssueForm((p) => ({ ...p, issue_description: e.target.value }))}
                            rows={2}
                            placeholder="รายละเอียด (ไม่บังคับ)"
                            className={inputClass()}
                        />

                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-600">แท็กคน (@)</label>
                            {issueForm.tagged_users.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {issueForm.tagged_users.map((u) => (
                                        <span
                                            key={u.user_id}
                                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full"
                                        >
                                            @{u.user_fullname}
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setIssueForm((p) => ({
                                                        ...p,
                                                        tagged_users: p.tagged_users.filter(
                                                            (t) => t.user_id !== u.user_id,
                                                        ),
                                                    }))
                                                }
                                                className="text-blue-600 hover:text-red-600"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="relative">
                                <input
                                    type="text"
                                    value={issueTagQuery}
                                    onChange={(e) => {
                                        setIssueTagQuery(e.target.value);
                                        setIssueTagDropdownOpen(true);
                                    }}
                                    onFocus={() => {
                                        if (issueTagBlurTimer.current) clearTimeout(issueTagBlurTimer.current);
                                        setIssueTagDropdownOpen(true);
                                    }}
                                    onBlur={() => {
                                        issueTagBlurTimer.current = setTimeout(
                                            () => setIssueTagDropdownOpen(false),
                                            150,
                                        );
                                    }}
                                    placeholder="พิมพ์ @ ตามด้วยชื่อเพื่อแท็กคน..."
                                    className={inputClass()}
                                />
                                {issueTagDropdownOpen && issueTagQuery.trim() && (
                                    <div className="absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-100 max-h-40 overflow-y-auto">
                                        {issueTagResults.length === 0 ? (
                                            <p className="px-3 py-2 text-xs text-gray-400">ไม่พบผู้ใช้งาน</p>
                                        ) : (
                                            issueTagResults.map((u) => (
                                                <button
                                                    key={u.user_id}
                                                    type="button"
                                                    onClick={() => {
                                                        if (issueTagBlurTimer.current)
                                                            clearTimeout(issueTagBlurTimer.current);
                                                        setIssueForm((p) => ({
                                                            ...p,
                                                            tagged_users: [...p.tagged_users, u],
                                                        }));
                                                        setIssueTagQuery("");
                                                        setIssueTagResults([]);
                                                        setIssueTagDropdownOpen(false);
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                                                >
                                                    @{u.user_fullname}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-gray-600">รูปแนบ</label>
                                <span className="text-[11px] text-gray-400">
                                    {totalIssueImageCount()}/{MAX_ISSUE_IMAGES}
                                </span>
                            </div>
                            {(editingIssue?.images.some((img) => issueKeepImageIds.includes(img.image_id)) ||
                                issueNewImages.length > 0) && (
                                <div className="flex flex-wrap gap-2">
                                    {editingIssue?.images
                                        .filter((img) => issueKeepImageIds.includes(img.image_id))
                                        .map((img) => (
                                            <div key={img.image_id} className="relative w-16 h-16 shrink-0">
                                                <Image
                                                    src={`${SERVER_BASE}${img.image_url}`}
                                                    alt=""
                                                    width={64}
                                                    height={64}
                                                    unoptimized
                                                    className="w-16 h-16 object-cover rounded border border-gray-200"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setIssueKeepImageIds((prev) =>
                                                            prev.filter((i) => i !== img.image_id),
                                                        )
                                                    }
                                                    className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-gray-700 text-white text-[10px] leading-none hover:bg-red-600"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    {issueNewImages.map((file, idx) => (
                                        <div key={idx} className="relative w-16 h-16 shrink-0">
                                            <Image
                                                src={URL.createObjectURL(file)}
                                                alt=""
                                                width={64}
                                                height={64}
                                                unoptimized
                                                className="w-16 h-16 object-cover rounded border border-gray-200"
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setIssueNewImages((prev) => prev.filter((_, i) => i !== idx))
                                                }
                                                className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-gray-700 text-white text-[10px] leading-none hover:bg-red-600"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {totalIssueImageCount() < MAX_ISSUE_IMAGES && (
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(e) => {
                                        handlePickIssueImages(e.target.files);
                                        e.target.value = "";
                                    }}
                                    className="text-xs text-gray-500 file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-blue-50 file:text-blue-600 file:text-xs hover:file:bg-blue-100"
                                />
                            )}
                        </div>

                        {issueFormError && <p className="text-xs text-red-600">{issueFormError}</p>}
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIssueFormOpen(false)}
                                className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                            >
                                ยกเลิก
                            </button>
                            <Button type="submit" disabled={isSavingIssue}>
                                {isSavingIssue ? "กำลังบันทึก..." : editingIssue ? "บันทึก" : "แจ้งปัญหา"}
                            </Button>
                        </div>
                    </form>
                )}

                {detailIssues.length === 0 ? (
                    <p className="text-sm text-gray-400">ยังไม่มีปัญหาที่แจ้งไว้</p>
                ) : (
                    <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100 overflow-hidden">
                        {detailIssues.map((issue) => (
                            <li key={issue.issue_id} className="px-4 py-2.5 space-y-1">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-700">{issue.issue_title}</p>
                                        {issue.issue_description && (
                                            <p className="text-xs text-gray-500 whitespace-pre-wrap mt-0.5">
                                                {issue.issue_description}
                                            </p>
                                        )}
                                        {issue.images.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                {issue.images.map((img) => (
                                                    <button
                                                        key={img.image_id}
                                                        type="button"
                                                        onClick={() =>
                                                            window.open(`${SERVER_BASE}${img.image_url}`, "_blank")
                                                        }
                                                    >
                                                        <Image
                                                            src={`${SERVER_BASE}${img.image_url}`}
                                                            alt=""
                                                            width={48}
                                                            height={48}
                                                            unoptimized
                                                            className="w-12 h-12 object-cover rounded border border-gray-200 hover:opacity-80"
                                                        />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {issue.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                {issue.tags.map((t) => (
                                                    <span
                                                        key={t.user_id}
                                                        className="text-[11px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full"
                                                    >
                                                        @{t.user_fullname}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <p className="text-[11px] text-gray-400 mt-1">
                                            {issue.created_by_name ?? "ผู้ใช้งานที่ถูกลบ"} ·{" "}
                                            {formatDate(issue.issue_created_at)}
                                        </p>
                                    </div>
                                    <StatusPill tone={issue.issue_status === "open" ? "danger" : "success"}>
                                        {ISSUE_STATUS_LABEL[issue.issue_status]}
                                    </StatusPill>
                                </div>
                                <div className="flex items-center gap-3 pt-1">
                                    {canChangeStatus && (
                                        <button
                                            type="button"
                                            onClick={() => handleToggleIssueStatus(issue)}
                                            className="text-xs text-blue-600 hover:underline"
                                        >
                                            {issue.issue_status === "open" ? "ทำเครื่องหมายว่าแก้ไขแล้ว" : "เปิดใหม่"}
                                        </button>
                                    )}
                                    {canEdit && (
                                        <button
                                            type="button"
                                            onClick={() => openEditIssue(issue)}
                                            className="text-xs text-gray-500 hover:underline"
                                        >
                                            แก้ไข
                                        </button>
                                    )}
                                    {canDelete && (
                                        <button
                                            type="button"
                                            onClick={() => setDeleteIssueTarget(issue)}
                                            className="text-xs text-red-600 hover:underline"
                                        >
                                            ลบ
                                        </button>
                                    )}
                                </div>

                                {(() => {
                                    const replies = issueRepliesByIssue[issue.issue_id] ?? [];
                                    const newImages = replyNewImagesByIssue[issue.issue_id] ?? [];
                                    return (
                                        <div className="mt-2 pl-3 border-l-2 border-gray-100 space-y-2">
                                            {issueRepliesLoading ? (
                                                <p className="text-xs text-gray-400">กำลังโหลด...</p>
                                            ) : replies.length === 0 ? (
                                                <p className="text-xs text-gray-400">ยังไม่มีการตอบกลับ</p>
                                            ) : (
                                                replies.map((reply) => (
                                                    <div key={reply.reply_id} className="flex items-start gap-2">
                                                        <Image
                                                            src={
                                                                reply.user_avatar_url
                                                                    ? `${SERVER_BASE}${reply.user_avatar_url}`
                                                                    : "/defult.png"
                                                            }
                                                            alt=""
                                                            width={20}
                                                            height={20}
                                                            unoptimized={!!reply.user_avatar_url}
                                                            className="w-5 h-5 rounded-full object-cover border border-gray-200 shrink-0 mt-0.5"
                                                        />
                                                        <div className="min-w-0">
                                                            <p className="text-xs text-gray-700">
                                                                <span className="font-medium">
                                                                    {reply.user_fullname ?? "ผู้ใช้งานที่ถูกลบ"}
                                                                </span>{" "}
                                                                <span className="text-gray-400">
                                                                    {formatDate(reply.reply_created_at)}
                                                                </span>
                                                            </p>
                                                            {reply.reply_text && (
                                                                <p className="text-xs text-gray-600 whitespace-pre-wrap">
                                                                    {reply.reply_text}
                                                                </p>
                                                            )}
                                                            {reply.images.length > 0 && (
                                                                <div className="flex flex-wrap gap-1.5 mt-1">
                                                                    {reply.images.map((img) => (
                                                                        <button
                                                                            key={img.image_id}
                                                                            type="button"
                                                                            onClick={() =>
                                                                                window.open(
                                                                                    `${SERVER_BASE}${img.image_url}`,
                                                                                    "_blank",
                                                                                )
                                                                            }
                                                                        >
                                                                            <Image
                                                                                src={`${SERVER_BASE}${img.image_url}`}
                                                                                alt=""
                                                                                width={40}
                                                                                height={40}
                                                                                unoptimized
                                                                                className="w-10 h-10 object-cover rounded border border-gray-200 hover:opacity-80"
                                                                            />
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                            <form
                                                onSubmit={(e) => handleSendReply(e, issue.issue_id)}
                                                className="space-y-1.5 pt-1"
                                            >
                                                {newImages.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {newImages.map((file, idx) => (
                                                            <div key={idx} className="relative w-10 h-10">
                                                                <Image
                                                                    src={URL.createObjectURL(file)}
                                                                    alt=""
                                                                    width={40}
                                                                    height={40}
                                                                    unoptimized
                                                                    className="w-10 h-10 object-cover rounded border border-gray-200"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setReplyNewImagesByIssue((prev) => ({
                                                                            ...prev,
                                                                            [issue.issue_id]: (
                                                                                prev[issue.issue_id] ?? []
                                                                            ).filter((_, i) => i !== idx),
                                                                        }))
                                                                    }
                                                                    className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] leading-none"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2">
                                                    <label className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-400 hover:text-blue-500 hover:border-blue-400 cursor-pointer">
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth={1.8}
                                                            className="w-4 h-4"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                                                            />
                                                        </svg>
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            multiple
                                                            className="hidden"
                                                            onChange={(e) => {
                                                                handlePickReplyImages(issue.issue_id, e.target.files);
                                                                e.target.value = "";
                                                            }}
                                                        />
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={replyDrafts[issue.issue_id] ?? ""}
                                                        onChange={(e) =>
                                                            setReplyDrafts((prev) => ({
                                                                ...prev,
                                                                [issue.issue_id]: e.target.value,
                                                            }))
                                                        }
                                                        placeholder="พิมพ์ข้อความตอบกลับ..."
                                                        className="flex-1 px-2.5 py-1.5 text-xs border rounded focus:outline-none focus:ring-2 border-gray-300 focus:border-blue-400 focus:ring-blue-500/20"
                                                    />
                                                    <button
                                                        type="submit"
                                                        disabled={
                                                            isSendingReply ||
                                                            (!(replyDrafts[issue.issue_id] ?? "").trim() &&
                                                                newImages.length === 0)
                                                        }
                                                        className="shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded hover:bg-blue-600 disabled:opacity-40"
                                                    >
                                                        ส่ง
                                                    </button>
                                                </div>
                                            </form>
                                        </div>
                                    );
                                })()}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <ConfirmDialog
                open={!!deleteIssueTarget}
                title="ลบปัญหานี้?"
                description={
                    deleteIssueTarget ? `"${deleteIssueTarget.issue_title}" จะถูกลบและไม่สามารถกู้คืนได้` : undefined
                }
                confirmLabel="ลบ"
                loading={isDeletingIssue}
                onConfirm={handleDeleteIssue}
                onCancel={() => setDeleteIssueTarget(null)}
            />
        </>
    );
}
