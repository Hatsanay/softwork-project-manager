import { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & { error?: boolean };

export default function Input({ className = "", error, ...props }: InputProps) {
    return (
        <input
            {...props}
            className={`px-4 py-2 border rounded focus:outline-none focus:ring-2 ${
                error
                    ? "border-red-400 focus:border-red-400 focus:ring-red-500/20"
                    : "border-gray-300 focus:border-blue-400 focus:ring-blue-500/20"
            } ${className}`}
        />
    );
}