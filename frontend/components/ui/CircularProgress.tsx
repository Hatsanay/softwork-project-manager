type Props = {
    percent: number;
    size?: number;
    strokeWidth?: number;
    className?: string;
};

const TRACK_COLOR = "#e5e7eb"; // gray-200

function colorFor(percent: number) {
    if (percent >= 100) return "#22c55e"; // green-500
    if (percent >= 50) return "#3b82f6"; // blue-500
    if (percent > 0) return "#f59e0b"; // amber-500
    return "#d1d5db"; // gray-300
}

export default function CircularProgress({ percent, size = 76, strokeWidth = 7, className = "" }: Props) {
    const clamped = Math.max(0, Math.min(100, percent));
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (clamped / 100) * circumference;
    const center = size / 2;

    return (
        <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={center} cy={center} r={radius} fill="none" stroke={TRACK_COLOR} strokeWidth={strokeWidth} />
                <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={colorFor(clamped)}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className="transition-[stroke-dashoffset,stroke] duration-700 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-gray-700">{Math.round(clamped)}%</span>
            </div>
        </div>
    );
}
