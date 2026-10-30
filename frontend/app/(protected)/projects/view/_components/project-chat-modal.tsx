"use client";

// แชทรวมของโปรเจกต์ (แยกจาก page.tsx 2026-10-30 · ส่วน C) · ดึงข้อความใหม่ทุก 4 วินาทีเฉพาะตอนแท็บเปิดดูอยู่
// ข้อความ ร่าง รูปแนบ และข้อความที่ตอบกลับ อยู่ในหน้าต่างนี้ · ปิดแล้วเปิดใหม่ = เริ่มใหม่ · ดึงสำเร็จ = อ่านแล้ว (onRead เคลียร์ตัวเลขในหน้า)
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { api } from "@/app/constans";
import formatDate from "@/app/function";
import {
    authHeader,
    CHAT_POLL_INTERVAL_MS,
    MAX_CHAT_IMAGES,
    sameMessageList,
    scrollToChatMessage,
    SERVER_BASE,
    truncateReplyPreview,
} from "../_lib/view-helpers";
import type { ProjectChatMessage } from "../_types";

export default function ProjectChatModal({
    projectId,
    projectName,
    currentUserId,
    onRead,
    onClose,
}: {
    projectId: string;
    projectName: string;
    currentUserId: string;
    onRead: () => void;
    onClose: () => void;
}) {
    const [projectChatMessages, setProjectChatMessages] = useState<ProjectChatMessage[]>([]);
    const [projectChatText, setProjectChatText] = useState("");
    const [projectChatNewImages, setProjectChatNewImages] = useState<File[]>([]);
    const [isSendingProjectChat, setIsSendingProjectChat] = useState(false);
    const [replyingToProjectChat, setReplyingToProjectChat] = useState<ProjectChatMessage | null>(null);
    const projectChatListRef = useRef<HTMLDivElement | null>(null);

    async function loadProjectChatMessages() {
        const res = await fetch(`${api}/projects/${projectId}/chat`, { headers: authHeader() });
        if (!res.ok) return;
        const data = await res.json();
        setProjectChatMessages((prev) => (sameMessageList(prev, data.data ?? []) ? prev : (data.data ?? [])));
        // ดึงข้อความสำเร็จ = backend mark-read ให้แล้ว เคลียร์ badge ฝั่ง state ทันทีแบบ optimistic เหมือน loadChatMessages
        onRead();
    }

    function handlePickProjectChatImages(files: FileList | null) {
        if (!files) return;
        const picked = Array.from(files);
        const remaining = MAX_CHAT_IMAGES - projectChatNewImages.length;
        if (remaining <= 0) {
            toast.error(`แนบรูปได้สูงสุด ${MAX_CHAT_IMAGES} รูปต่อข้อความ`);
            return;
        }
        setProjectChatNewImages((prev) => [...prev, ...picked.slice(0, remaining)]);
    }

    async function handleSendProjectChat(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!projectChatText.trim() && projectChatNewImages.length === 0) return;

        setIsSendingProjectChat(true);
        try {
            const fd = new FormData();
            fd.append("message_text", projectChatText.trim());
            if (replyingToProjectChat) fd.append("reply_to_message_id", replyingToProjectChat.message_id);
            for (const file of projectChatNewImages) fd.append("images", file);

            const res = await fetch(`${api}/projects/${projectId}/chat`, {
                method: "POST",
                headers: authHeader(),
                body: fd,
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message ?? "ส่งข้อความไม่สำเร็จ");
                return;
            }
            setProjectChatText("");
            setProjectChatNewImages([]);
            setReplyingToProjectChat(null);
            await loadProjectChatMessages();
        } finally {
            setIsSendingProjectChat(false);
        }
    }

    function handleProjectChatComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
        }
    }

    // แชทรวมของโปรเจกต์เปิดอยู่ ก็ poll ข้อความใหม่เป็นระยะเหมือนแชทของ task
    useEffect(() => {
        // โหลดครั้งแรกผ่าน timer (ไม่ setState ตรงๆ ในตัว effect)
        const firstLoad = setTimeout(loadProjectChatMessages, 0);
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") loadProjectChatMessages();
        }, CHAT_POLL_INTERVAL_MS);
        const onVisible = () => {
            if (document.visibilityState === "visible") loadProjectChatMessages();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            clearTimeout(firstLoad);
            clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    useEffect(() => {
        if (!projectChatListRef.current) return;
        projectChatListRef.current.scrollTop = projectChatListRef.current.scrollHeight;
    }, [projectChatMessages]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-t-2xl sm:rounded-2xl shadow-float w-full max-w-3xl h-[80dvh] max-h-150 flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <h3 className="text-sm font-medium text-gray-700 truncate">แชทโปรเจกต์ · {projectName}</h3>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.8}
                            className="w-4 h-4"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div ref={projectChatListRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                    {projectChatMessages.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center pt-6">ยังไม่มีข้อความ</p>
                    ) : (
                        projectChatMessages.map((msg) => {
                            const isOwn = msg.user_id === currentUserId;
                            const avatarSrc = msg.user_avatar_url
                                ? `${SERVER_BASE}${msg.user_avatar_url}`
                                : "/defult.png";
                            const avatar = (
                                <Image
                                    src={avatarSrc}
                                    alt=""
                                    width={28}
                                    height={28}
                                    unoptimized={!!msg.user_avatar_url}
                                    className="w-7 h-7 rounded-full object-cover border border-gray-200 shrink-0"
                                />
                            );
                            const bubble = (
                                <div
                                    className={`max-w-[75%] rounded-2xl px-3 py-2 ${isOwn ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800"}`}
                                >
                                    {!isOwn && (
                                        <p className="text-[11px] font-medium text-gray-500 mb-0.5">
                                            {msg.user_fullname ?? "ผู้ใช้งานที่ถูกลบ"}
                                        </p>
                                    )}
                                    {msg.reply_to_message_id && (
                                        <button
                                            type="button"
                                            onClick={() => scrollToChatMessage(msg.reply_to_message_id!)}
                                            className={`block w-full text-left mb-1 pl-2 border-l-2 rounded ${
                                                isOwn ? "border-blue-200 bg-blue-50" : "border-gray-300 bg-white/60"
                                            }`}
                                        >
                                            <p
                                                className={`text-[11px] font-medium ${isOwn ? "text-blue-50" : "text-gray-600"}`}
                                            >
                                                {msg.reply_to_user_fullname ?? "ผู้ใช้งานที่ถูกลบ"}
                                            </p>
                                            <p
                                                className={`text-[11px] truncate ${isOwn ? "text-blue-100" : "text-gray-500"}`}
                                            >
                                                {msg.reply_to_text
                                                    ? truncateReplyPreview(msg.reply_to_text)
                                                    : msg.reply_to_image_count > 0
                                                      ? "[รูปภาพ]"
                                                      : ""}
                                            </p>
                                        </button>
                                    )}
                                    {msg.message_text && (
                                        <p className="text-sm whitespace-pre-wrap wrap-break-word">
                                            {msg.message_text}
                                        </p>
                                    )}
                                    {msg.images.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {msg.images.map((img) => (
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
                                                        width={96}
                                                        height={96}
                                                        unoptimized
                                                        className="w-20 h-20 object-cover rounded-lg"
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 mt-1">
                                        <p className={`text-[10px] ${isOwn ? "text-blue-100" : "text-gray-400"}`}>
                                            {formatDate(msg.message_created_at)}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setReplyingToProjectChat(msg)}
                                            className={`text-[10px] font-medium hover:underline ${isOwn ? "text-blue-100" : "text-gray-400"}`}
                                        >
                                            ตอบกลับ
                                        </button>
                                    </div>
                                </div>
                            );
                            return (
                                <div
                                    key={msg.message_id}
                                    id={`chat-msg-${msg.message_id}`}
                                    className={`flex items-end gap-2 rounded-lg transition-shadow ${isOwn ? "justify-end" : "justify-start"}`}
                                >
                                    {isOwn ? (
                                        <>
                                            {bubble}
                                            {avatar}
                                        </>
                                    ) : (
                                        <>
                                            {avatar}
                                            {bubble}
                                        </>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                <form onSubmit={handleSendProjectChat} className="border-t border-gray-100 p-3 space-y-2 shrink-0">
                    {replyingToProjectChat && (
                        <div className="flex items-start justify-between gap-2 pl-2 border-l-2 border-blue-400 bg-blue-50 rounded px-2 py-1.5">
                            <div className="min-w-0">
                                <p className="text-[11px] font-medium text-blue-600">
                                    ตอบกลับ {replyingToProjectChat.user_fullname ?? "ผู้ใช้งานที่ถูกลบ"}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                    {replyingToProjectChat.message_text
                                        ? truncateReplyPreview(replyingToProjectChat.message_text)
                                        : replyingToProjectChat.images.length > 0
                                          ? "[รูปภาพ]"
                                          : ""}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setReplyingToProjectChat(null)}
                                className="shrink-0 text-gray-400 hover:text-gray-600"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={1.8}
                                    className="w-3.5 h-3.5"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    )}
                    {projectChatNewImages.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {projectChatNewImages.map((file, idx) => (
                                <div key={idx} className="relative w-12 h-12 shrink-0">
                                    <Image
                                        src={URL.createObjectURL(file)}
                                        alt=""
                                        width={48}
                                        height={48}
                                        unoptimized
                                        className="w-12 h-12 object-cover rounded border border-gray-200"
                                    />
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setProjectChatNewImages((prev) => prev.filter((_, i) => i !== idx))
                                        }
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-gray-700 text-white text-[10px] leading-none hover:bg-red-600"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex items-end gap-2">
                        <textarea
                            value={projectChatText}
                            onChange={(e) => setProjectChatText(e.target.value)}
                            onKeyDown={handleProjectChatComposerKeyDown}
                            rows={1}
                            placeholder="พิมพ์ข้อความ..."
                            className="flex-1 resize-none px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 border-gray-300 focus:border-blue-400 focus:ring-blue-500/20"
                        />
                        <label className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 cursor-pointer">
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
                                    handlePickProjectChatImages(e.target.files);
                                    e.target.value = "";
                                }}
                            />
                        </label>
                        <button
                            type="submit"
                            disabled={
                                isSendingProjectChat || (!projectChatText.trim() && projectChatNewImages.length === 0)
                            }
                            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="w-4 h-4"
                            >
                                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                            </svg>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
