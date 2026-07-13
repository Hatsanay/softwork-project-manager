import { ButtonHTMLAttributes } from "react";
import { Eye } from "lucide-react";

interface ViewButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

export default function ViewButton({ children, ...props }: ViewButtonProps) {
  return (
    <button
      {...props}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 text-sm font-medium"
    >
      <Eye className="w-4 h-4" />
      {children}
    </button>
  );
}