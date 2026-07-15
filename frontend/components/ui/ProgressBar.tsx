type Props = {
    percent: number;
    className?: string;
};

export default function ProgressBar({ percent, className = "" }: Props) {
    const clamped = Math.max(0, Math.min(100, percent));
    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${clamped}%` }}
                />
            </div>
            <span className="text-xs font-medium text-gray-500 shrink-0 w-10 text-right">
                {clamped.toFixed(0)}%
            </span>
        </div>
    );
}
