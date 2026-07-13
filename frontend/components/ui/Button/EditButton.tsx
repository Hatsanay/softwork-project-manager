import { ButtonHTMLAttributes } from "react";
import { Pencil } from "lucide-react";

interface EditButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

export default function EditButton({ children, ...props }: EditButtonProps) {
  return (
    <button
      {...props}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-white text-sm rounded transition-colors duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Pencil className="w-4 h-4" />
      {children}
    </button>
  );
}
