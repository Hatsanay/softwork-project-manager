import { ButtonHTMLAttributes } from "react";
import { Trash2 } from "lucide-react";

interface DeleteButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

export default function DeleteButton({ children, ...props }: DeleteButtonProps) {
  return (
    <button
      {...props}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm rounded transition-colors duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Trash2 className="w-4 h-4" />
      {children}
    </button>
  );
}
