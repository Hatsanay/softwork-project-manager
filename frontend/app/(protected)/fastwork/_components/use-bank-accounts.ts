"use client";

// บัญชีธนาคารบาทที่ยังใช้งานของบริษัท (ตัวเลือกบัญชีโอนออก/รับเข้า) + บัญชีหลักสำหรับเติมเป็นค่าเริ่มต้น
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { BankAccountChoice } from "../_types";

export function useBankAccounts() {
    const [bankAccounts, setBankAccounts] = useState<BankAccountChoice[]>([]);
    const [defaultAccountId, setDefaultAccountId] = useState("");

    useEffect(() => {
        let isClosed = false;
        apiFetch<{ bank_accounts: BankAccountChoice[] }>("/company").then(({ data }) => {
            if (isClosed) return;
            const accounts = (data?.bank_accounts ?? []).filter((account) => account.ba_status === "active" && account.ba_currency === "THB");
            setBankAccounts(accounts);
            const defaultAccount = accounts.find((account) => Boolean(account.ba_is_default)) ?? accounts[0];
            setDefaultAccountId(defaultAccount?.ba_id ?? "");
        });
        return () => {
            isClosed = true;
        };
    }, []);

    return { bankAccounts, defaultAccountId };
}
