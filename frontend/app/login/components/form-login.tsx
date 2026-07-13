"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Form from "@/components/ui/form/Form";
import Input from "@/components/ui/Input/input";
import Button from "@/components/ui/Button/Button";
import { handleLogin } from "../actions";

export default function LoginForm() {
    const router = useRouter();
    const [state, formAction, pending] = useActionState(handleLogin, null);

    useEffect(() => {
        if (!state) return;
        if ("error" in state) {
            toast.error(state.error);
        } else if ("token" in state) {
            localStorage.setItem("token", state.token);
            router.push("/dashboard");
        }
    }, [state, router]);

    return (
        <Form cols={1} className="max-w-md mx-auto" action={formAction}>
            <div className="text-center">
                <h1 className="text-4xl font-bold mb-4 text-blue-400">Login</h1>
            </div>
            <Input type="email" name="user_email" placeholder="อีเมล" required />
            <Input type="password" name="user_password" placeholder="รหัสผ่าน" required />
            <Button type="submit" disabled={pending}>
                {pending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </Button>
        </Form>
    );
}
