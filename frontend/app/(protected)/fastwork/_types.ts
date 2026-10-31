// งาน Fastwork (2026-10-24 · P-1) — ตรงกับคำตอบของ backend/src/services/fastwork.service.js

export type FastworkNextStep = "work" | "record" | "receive" | "close" | "pay" | "done";
export type FastworkPayoutStatus = "pending" | "received" | "cancelled";
export type FastworkMilestoneState = "open" | "delivered" | "pending" | "received";

export type FastworkSettings = {
    cs_fastwork_fee_rate: string;
    cs_fastwork_fee_vat_rate: string;
    cs_fastwork_wht_rate: string;
};

export type FastworkOverview = {
    today: string;
    steps: {
        active_projects: number;
        milestones_due_soon: number;
        milestones_awaiting_record: number;
        payouts_pending: number;
        // null = ไม่มีสิทธิ์เห็นยอดเงิน
        payouts_pending_net: string | null;
        projects_ready_to_close: number;
        // ส่วนแบ่ง (P-2)
        projects_without_shares: number;
        share_lines_unpaid: number;
    };
    due_soon_days: number;
    projects: {
        project_id: string;
        project_name: string;
        project_status: string;
        project_fastwork_order_no: string | null;
        client_name: string | null;
        project_due_date: string | null;
        milestone_count: number;
        received_count: number;
        next_step: FastworkNextStep;
        next_milestone: { fwm_name: string; fwm_due_date: string | null } | null;
        contract_amount: string | null;
    }[];
};

export type FastworkMilestone = {
    fwm_id: number;
    fwm_order: number;
    fwm_name: string;
    // ไม่มี = ไม่มีสิทธิ์เห็นยอดเงิน
    fwm_amount?: string;
    fwm_due_date: string | null;
    fwm_delivered_at: string | null;
    state: FastworkMilestoneState;
    payout_id: number | null;
};

export type FastworkPayout = {
    fwp_id: number;
    fwp_project_id: string;
    fwp_milestone_id: number | null;
    fwp_status: FastworkPayoutStatus;
    fwp_gross: string;
    fwp_fee_rate: string;
    fwp_fee: string;
    fwp_fee_vat: string;
    fwp_wht: string;
    fwp_wht_certificate_no: string | null;
    fwp_net: string;
    fwp_reference: string | null;
    fwp_note: string | null;
    fwp_cancel_reason: string | null;
    fwp_version: number;
    fwp_bank_account_id: string | null;
    fwp_approved_date: string;
    fwp_received_date: string | null;
    fwp_cancelled_at: string | null;
    fwp_created_at: string;
    project_name: string;
    project_fastwork_order_no: string | null;
    client_name: string | null;
    fwm_order: number | null;
    fwm_name: string | null;
    bank_account_label: string | null;
};

export type ProjectFastwork = {
    fastwork: {
        order_no: string | null;
        url: string | null;
        milestones: FastworkMilestone[];
        payouts: FastworkPayout[];
        totals: {
            contract: string;
            received_gross: string;
            pending_gross: string;
            not_yet_paid: string;
            fee: string;
            fee_vat: string;
            wht: string;
            net_received: string;
        } | null;
    } | null;
    can_see_money?: boolean;
};

export type BankAccountChoice = {
    ba_id: string;
    ba_bank_name: string;
    ba_account_no: string;
    ba_account_name: string;
    ba_currency: string;
    ba_is_default: boolean | number;
    ba_status: string;
};

// ─── ส่วนแบ่งกำไร (P-2 · 2026-10-24) — ตรงกับ backend/src/services/profit-share.service.js ───

export type ShareKind = "percent" | "fixed";
export type ShareListState = "unset" | "open" | "unpaid" | "paid";

export type ProfitItem = { date: string | null; label: string; amount: string };

export type ProjectShareRow = {
    shr_id: number;
    shr_user_id: string | null;
    shr_vendor_id: string | null;
    // ชื่อปัจจุบันของผู้ใช้/ผู้ขาย (backend JOIN ให้ ไม่ได้เก็บในตารางส่วนแบ่ง)
    recipient_name: string;
    shr_kind: ShareKind;
    shr_percent: string | null;
    shr_amount: string | null;
    shr_note: string | null;
};

export type ShareAdvance = {
    sha_id: number;
    sha_user_id: string | null;
    sha_vendor_id: string | null;
    sha_recipient_name: string;
    sha_amount: string;
    sha_status: "paid" | "cancelled";
    sha_reference: string | null;
    sha_note: string | null;
    sha_cancel_reason: string | null;
    sha_paid_date: string;
    bank_account_label: string | null;
};

export type SettlementLine = {
    ssl_id: number;
    ssl_user_id: string | null;
    ssl_vendor_id: string | null;
    ssl_recipient_name: string;
    ssl_kind: ShareKind;
    ssl_percent: string | null;
    ssl_amount: string;
    ssl_advanced: string;
    ssl_due: string;
    ssl_status: "unpaid" | "paid";
    ssl_wht: string;
    ssl_transfer_amount: string | null;
    ssl_reference: string | null;
    ssl_version: number;
    ssl_paid_date: string | null;
    bank_account_label: string | null;
};

export type Settlement = {
    sst_id: number;
    sst_status: "settled";
    sst_settled_date: string;
    sst_revenue: string;
    sst_platform_fee: string;
    sst_expense_cost: string;
    sst_distributable: string;
    sst_fixed_total: string;
    sst_after_fixed: string;
    sst_company_amount: string;
    sst_note: string | null;
    sst_version: number;
    sst_created_at: string;
    lines: SettlementLine[];
};

export type ProjectSharesDetail = {
    project: { project_id: string; project_name: string; project_status: string; project_channel: "direct" | "fastwork"; client_name: string | null };
    profit: {
        revenue: string;
        platform_fee: string;
        expense_cost: string;
        distributable: string;
        revenue_items: ProfitItem[];
        expense_items: ProfitItem[];
        pending_payouts: number;
        pending_expense: string;
    };
    shares: ProjectShareRow[];
    estimate: {
        fixed_total: string;
        after_fixed: string;
        company_amount: string;
        lines: { shr_id: number; amount: string; advanced: string; due: string }[];
    };
    // ถ้าเงินเข้าครบ (คาดการณ์ 2026-10-31) · remaining_revenue = 0 คือเงินเข้าครบแล้ว (ไม่ต้องแสดง)
    expected: {
        remaining_revenue: string;
        revenue: string;
        platform_fee: string;
        expense_cost: string;
        distributable: string;
        fixed_total: string;
        after_fixed: string;
        company_amount: string;
        lines: { shr_id: number; amount: string }[];
    };
    advances: ShareAdvance[];
    settlement: Settlement | null;
    changed_since_settlement: boolean;
    members: { user_id: string; full_name: string }[];
    today: string;
};

export type ShareProjectRow = {
    project_id: string;
    project_name: string;
    project_status: string;
    project_channel: "direct" | "fastwork";
    client_name: string | null;
    share_count: number;
    state: ShareListState;
    settled_date: string | null;
    distributable: string | null;
    company_amount: string | null;
    unpaid_count: number;
    is_ready_to_settle: boolean;
};

export type MyShare = {
    project: ProjectSharesDetail["project"];
    state: "estimate" | "settled" | "paid";
    numbers: { revenue: string; platform_fee: string; expense_cost: string; distributable: string; fixed_total: string; after_fixed: string };
    settled_date: string | null;
    mine: {
        kind: ShareKind;
        percent: string | null;
        amount: string;
        advanced: string;
        due: string;
        wht: string | null;
        transfer_amount: string | null;
        paid_date: string | null;
        reference: string | null;
    };
    revenue_items: ProfitItem[];
    expense_items: ProfitItem[];
    pending_payouts?: number;
    advances: ShareAdvance[];
};

// ─── เงินทุนสะสม (P-3 · 2026-10-25) — ตรงกับ backend/src/services/capital.service.js ───

export type CapitalEntry = {
    cpe_id: number;
    cpe_kind: "deposit" | "withdraw";
    cpe_amount: string;
    cpe_entry_date: string;
    cpe_note: string | null;
    cpe_status: "active" | "cancelled";
    cpe_cancel_reason: string | null;
    created_by_name: string | null;
};

export type CapitalProjectInflow = {
    sst_id: number;
    project_id: string;
    project_name: string;
    project_channel: "direct" | "fastwork";
    settled_date: string;
    amount: string;
};

export type CapitalOverview = {
    today: string;
    business: { incorporated_on: string | null; vat_registered_from: string | null };
    goal: { amount: string | null; target_date: string | null; percent: number | null };
    totals: { from_projects: string; deposits: string; withdrawals: string; balance: string };
    forecast: {
        months: { month: string; net: string }[];
        monthly_average: string;
        remaining: string | null;
        // "YYYY-MM" · null = ยังคาดไม่ได้ (เฉลี่ย ≤ 0) หรือถึงเป้าแล้ว
        reach_month: string | null;
    };
    project_inflows: CapitalProjectInflow[];
    entries: CapitalEntry[];
    // null = จด VAT แล้ว
    vat_ceiling: {
        year: number;
        ceiling: string;
        income: string;
        direct_sales: string;
        fastwork_gross: string;
        fastwork_fee: string;
        income_after_fastwork_fee: string;
        percent: number;
        remaining: string;
        state: "ok" | "near" | "over";
    } | null;
};
