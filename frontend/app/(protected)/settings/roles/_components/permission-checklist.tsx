"use client";

import { useEffect, useRef } from "react";
import { PERMISSION_GROUPS, GROUP_STARTS } from "@/app/components/bit";
import { usePermission } from "@/app/components/permission-provider";

// รายการติ๊กสิทธิ์ของหน้าสร้างและหน้าแก้ role (แยกออกมา 2026-10-12 — เดิมเขียนซ้ำสองหน้า)
//
// ติ๊กได้เฉพาะสิทธิ์ที่คนที่ใช้งานอยู่มีเอง (risk-fixes R25) — ให้สิทธิ์ที่ตัวเองไม่มีกับคนอื่นไม่ได้
// backend ตรวจซ้ำเสมอ ส่วนนี้มีไว้ให้ผู้ใช้รู้ก่อนกดบันทึก

type Props = {
    checked: boolean[];
    onChange: (next: boolean[]) => void;
    disabled?: boolean;
};

function IndeterminateCheckbox({
    indeterminate,
    ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = indeterminate ?? false;
    }, [indeterminate]);
    return <input ref={ref} type="checkbox" {...props} />;
}

function range(start: number, length: number) {
    return Array.from({ length }, (_, offset) => start + offset);
}

// บิตแรกของกลุ่ม (สิทธิ์ "ดู") ที่ต้องติ๊กตามเมื่อติ๊กสิทธิ์ย่อยในกลุ่ม
function findGroupStart(index: number): number | null {
    for (let groupIndex = 0; groupIndex < PERMISSION_GROUPS.length; groupIndex++) {
        const start = GROUP_STARTS[groupIndex];
        const length = PERMISSION_GROUPS[groupIndex].bits.length;
        if (index > start && index < start + length) return start;
    }
    return null;
}

export default function PermissionChecklist({ checked, onChange, disabled = false }: Props) {
    const hasOwnPermission = usePermission();
    const canGrant = (index: number) => hasOwnPermission(index);

    const grantableIndexes = range(0, checked.length).filter(canGrant);
    const lacksSomePermissions = grantableIndexes.length < checked.length;
    const allGrantableChecked = grantableIndexes.length > 0 && grantableIndexes.every((index) => checked[index]);
    const someChecked = checked.some(Boolean);

    function setBits(indexes: number[], value: boolean) {
        const next = [...checked];
        for (const index of indexes) {
            if (canGrant(index)) next[index] = value;
        }
        onChange(next);
    }

    function toggleBit(index: number) {
        const next = [...checked];
        next[index] = !next[index];

        const groupStart = findGroupStart(index);
        if (next[index] && groupStart !== null && canGrant(groupStart)) next[groupStart] = true;

        onChange(next);
    }

    function toggleGroup(start: number, length: number) {
        const indexes = range(start, length).filter(canGrant);
        const allChecked = indexes.every((index) => checked[index]);
        setBits(indexes, !allChecked);
    }

    return (
        <fieldset disabled={disabled} className="disabled:opacity-60">
            <label className="flex items-center gap-3 cursor-pointer mb-3">
                <IndeterminateCheckbox
                    checked={allGrantableChecked}
                    indeterminate={!allGrantableChecked && someChecked}
                    onChange={() => setBits(grantableIndexes, !allGrantableChecked)}
                    className="w-4 h-4 accent-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">ทั้งหมด</span>
            </label>
            <p className="-mt-2 mb-3 text-xs text-gray-500">
                เลือกหรือยกเลิกสิทธิ์ทุกข้อในหน้านี้ในครั้งเดียว
                {lacksSomePermissions && " · ติ๊กได้เฉพาะสิทธิ์ที่คุณมี ข้อที่เป็นสีเทาคือสิทธิ์ที่คุณเองไม่มี จึงให้คนอื่นไม่ได้"}
            </p>

            <div className="space-y-2">
                {PERMISSION_GROUPS.map((group, groupIndex) => {
                    const start = GROUP_STARTS[groupIndex];
                    const length = group.bits.length;
                    const groupIndexes = range(start, length);
                    const groupAllChecked = groupIndexes.every((index) => checked[index]);
                    const groupSomeChecked = groupIndexes.some((index) => checked[index]);
                    const groupHasGrantable = groupIndexes.some(canGrant);

                    return (
                        <div key={group.groupLabel} className="rounded-lg border border-gray-100 overflow-hidden">
                            <label className="flex items-center gap-3 cursor-pointer px-4 py-2.5 bg-gray-50 hover:bg-gray-100">
                                <IndeterminateCheckbox
                                    checked={groupAllChecked}
                                    indeterminate={!groupAllChecked && groupSomeChecked}
                                    disabled={!groupHasGrantable}
                                    onChange={() => toggleGroup(start, length)}
                                    className="w-4 h-4 accent-blue-500"
                                />
                                <span className={`text-sm font-medium ${groupHasGrantable ? "text-gray-800" : "text-gray-400"}`}>
                                    {group.groupLabel}
                                </span>
                            </label>
                            <div className="divide-y divide-gray-50">
                                {group.bits.map((bit, bitOffset) => {
                                    const index = start + bitOffset;
                                    const isGrantable = canGrant(index);
                                    return (
                                        <label
                                            key={bit.key}
                                            className={`flex items-center gap-3 px-4 py-2 pl-10 ${isGrantable ? "cursor-pointer hover:bg-blue-50" : "cursor-not-allowed"}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked[index] ?? false}
                                                disabled={!isGrantable}
                                                onChange={() => toggleBit(index)}
                                                className="w-4 h-4 accent-blue-500"
                                            />
                                            <span className={`text-sm ${isGrantable ? "text-gray-700" : "text-gray-400"}`}>
                                                {bit.label}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </fieldset>
    );
}
