import { FormHTMLAttributes } from "react";

type Form = FormHTMLAttributes<HTMLFormElement> & {
  cols?: number;
};

export default function FormLogin({
  className = "",
  cols = 1,
  style,
  children,
  ...props
}: Form) {
  return (
    <form
      {...props}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, ...style }}
      className={`p-4 border border-gray-300 rounded mt-10 grid gap-x-6 gap-y-8 ${className}`}
    >
      {children}
    </form>
  );
}
