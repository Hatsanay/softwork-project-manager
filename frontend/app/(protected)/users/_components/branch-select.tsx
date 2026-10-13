"use client";

// ช่องเลือกสาขาเริ่มต้นของผู้ใช้ (2026-10-13 ขั้น 1A-1d) — ใช้ทั้งหน้าสร้างและแก้ไขผู้ใช้
// เลือกได้เฉพาะสาขาที่เปิดใช้งาน + สาขาเดิมของผู้ใช้ (แม้ถูกปิดไปแล้ว — backend ยอมให้คงไว้)
import { useEffect, useState } from "react";
import { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import { apiFetch } from "@/lib/api";

type BranchChoice = {
    branch_id: string;
    branch_code: string;
    branch_name_th: string;
    branch_status: "active" | "inactive";
    is_head_office: boolean;
};

type BranchSelectProps = {
    value: string;
    onChange: (branchId: string) => void;
    // สาขาที่บันทึกไว้ก่อนแก้ (หน้าแก้ไข) — ถ้าถูกปิดใช้งานแล้วยังแสดงให้เลือกคงไว้ได้
    savedBranchId?: string;
    disabled?: boolean;
    error?: string;
};

const HINT = "ใช้เป็นสาขาเริ่มต้นของเอกสารที่ผู้ใช้นี้สร้าง (แก้ในเอกสารได้) — ไม่จำกัดการมองเห็นข้อมูล";

export default function BranchSelect({
    value,
    onChange,
    savedBranchId = "",
    disabled = false,
    error,
}: BranchSelectProps) {
    const [branches, setBranches] = useState<BranchChoice[]>([]);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ branches: BranchChoice[] }>("/company").then(({ data }) => {
            if (!isLeftPage && data) setBranches(data.branches);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    const choices = branches.filter(
        (branch) => branch.branch_status === "active" || branch.branch_id === savedBranchId,
    );
    const selected = branches.find((branch) => branch.branch_id === value);
    const isSelectedInactive = selected !== undefined && selected.branch_status !== "active";

    return (
        <div className="flex flex-col gap-1">
            <label htmlFor="user_branch_id" className="text-sm font-medium text-gray-700">
                สาขา <span className="font-normal text-gray-400">(ไม่บังคับ)</span>
            </label>
            <select
                id="user_branch_id"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                aria-describedby="user_branch_id-hint"
                className={inputClass(Boolean(error))}
            >
                <option value="">— ไม่ระบุ (ใช้สำนักงานใหญ่) —</option>
                {choices.map((branch) => (
                    <option key={branch.branch_id} value={branch.branch_id}>
                        {branch.branch_code} · {branch.branch_name_th}
                        {branch.branch_status !== "active" ? " (ปิดใช้งาน)" : ""}
                    </option>
                ))}
            </select>
            <FieldHint id="user_branch_id-hint" error={error}>
                {isSelectedInactive
                    ? "สาขานี้ถูกปิดใช้งานแล้ว — คงไว้ได้ แต่ถ้าเปลี่ยนจะเลือกได้เฉพาะสาขาที่เปิดใช้งาน"
                    : HINT}
            </FieldHint>
        </div>
    );
}
