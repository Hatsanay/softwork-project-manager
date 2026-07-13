"use client";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "warning" | "info";
    loading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const variantStyles = {
    danger:  { icon: "🗑️", confirmClass: "bg-red-500 hover:bg-red-600" },
    warning: { icon: "⚠️", confirmClass: "bg-amber-500 hover:bg-amber-600" },
    info:    { icon: "ℹ️", confirmClass: "bg-blue-500 hover:bg-blue-600" },
};

export default function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = "ยืนยัน",
    cancelLabel = "ยกเลิก",
    variant = "danger",
    loading = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    if (!open) return null;

    const { icon, confirmClass } = variantStyles[variant];

    return (
        // Backdrop — คลิกนอก dialog เพื่อปิด
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={onCancel}
        >
            <div
                className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col items-center text-center gap-2">
                    <span className="text-4xl">{icon}</span>
                    <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
                    {description && (
                        <p className="text-sm text-gray-500">{description}</p>
                    )}
                </div>

                <div className="flex gap-3 pt-2">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className={`flex-1 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 transition-colors ${confirmClass}`}
                    >
                        {loading ? "กำลังลบ..." : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
