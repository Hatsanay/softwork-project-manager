"use client";

import dynamic from "next/dynamic";
import Loading from "@/app/loading";

const LoginForm = dynamic(
  () => import("./components/form-login"),
  { loading: () => <Loading />, ssr: false }
);

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <LoginForm />
      </div>
    </div>
  );
}
