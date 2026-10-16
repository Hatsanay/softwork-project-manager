// ชนิดข้อมูลเจ้าหนี้คงค้าง — ตรงกับคำตอบของ backend/src/services/payable.service.js · ช่วงอายุชุดเดียวกับลูกหนี้
import type { AgingAmounts, AgingBucket, AgingBucketKey } from "../../sales/receivables/_types";

export type PayeeKind = "vendor" | "employee";

export type AgingPayeeRow = AgingAmounts & {
    payee_kind: PayeeKind;
    payee_id: string;
    payee_name: string | null;
    expense_count: number;
    oldest_days_overdue: number;
};

export type PayablesSummary = {
    buckets: AgingBucket[];
    payees: AgingPayeeRow[];
    totals: AgingAmounts;
    today: string;
};

export type AgingExpenseRow = {
    ex_id: string;
    ex_number: string;
    ex_kind: "bill" | "claim";
    ex_title: string;
    ex_currency: string;
    ex_total: string;
    ex_paid_amount: string;
    ex_expense_date: string;
    ex_due_date: string;
    outstanding_amount: string;
    outstanding_thb: string;
    days_overdue: number;
    cur_decimals: number;
    bucket: AgingBucketKey;
};

export type PayablesOfPayee = {
    payee: { payee_kind: PayeeKind; payee_id: string; payee_name: string | null } | null;
    buckets: AgingBucket[];
    expenses: AgingExpenseRow[];
    today: string;
};
