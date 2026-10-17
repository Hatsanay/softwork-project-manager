// ชนิดข้อมูลฝั่งบุคคล (เฟส 4) — ชื่อฟิลด์ตามคอลัมน์ฐานข้อมูล (CODING_GUIDELINES 2) · เงินเป็นข้อความทศนิยม "30000.00"

export type ActiveStatus = "active" | "inactive";

// ยังไม่เริ่มงาน · ทำงานอยู่ · ตั้งวันออกไว้แล้ว (ยังทำงานจนถึงวันนั้น) · พ้นสภาพ
export type EmploymentStatus = "upcoming" | "active" | "leaving" | "terminated";

export type EmployeeListRow = {
    emp_id: string;
    emp_code: string;
    emp_title: string | null;
    emp_first_name_th: string;
    emp_last_name_th: string;
    emp_nickname: string | null;
    emp_position: string | null;
    emp_user_id: string | null;
    emp_birth_date: string | null;
    emp_hire_date: string;
    emp_termination_date: string | null;
    department_name: string | null;
    branch_name: string | null;
    user_username: string | null;
    employment_status: EmploymentStatus;
    national_id_masked: string | null;
};

export type Compensation = {
    ecm_effective_from: string;
    ecm_base_salary: string;
    ecm_note: string | null;
    ecm_created_at: string;
    created_by_name: string | null;
};

export type RecurringItemKind = "earning" | "deduction";
export type RecurringItemStatus = "upcoming" | "active" | "ended";

export type RecurringItem = {
    eri_id: number;
    eri_kind: RecurringItemKind;
    eri_label: string;
    eri_amount: string;
    eri_is_taxable: boolean;
    eri_is_sso_wage: boolean;
    eri_note: string | null;
    eri_effective_from: string;
    eri_effective_to: string | null;
    item_status: RecurringItemStatus;
};

export type Employee = {
    emp_id: string;
    emp_code: string;
    emp_user_id: string | null;
    emp_title: string | null;
    emp_first_name_th: string;
    emp_last_name_th: string;
    emp_first_name_en: string | null;
    emp_last_name_en: string | null;
    emp_nickname: string | null;
    emp_national_id: string | null;
    emp_birth_date: string | null;
    emp_address: string | null;
    emp_phone: string | null;
    emp_email: string | null;
    emp_department_id: string | null;
    emp_position: string | null;
    emp_branch_id: string | null;
    emp_hire_date: string;
    emp_termination_date: string | null;
    emp_termination_reason: string | null;
    emp_bank_name: string | null;
    emp_bank_account_no: string | null;
    emp_bank_account_name: string | null;
    emp_sso_enrolled: boolean;
    emp_sso_number: string | null;
    emp_notes: string | null;
    department_name: string | null;
    branch_name: string | null;
    user_username: string | null;
    user_fullname: string | null;
    user_status: ActiveStatus | null;
    employment_status: EmploymentStatus;
    compensations: Compensation[];
    current_compensation: Compensation | null;
    recurring_items: RecurringItem[];
    today: string;
};

export type EmployeeFormOptions = {
    departments: { dep_id: string; dep_name: string; dep_status: ActiveStatus }[];
    branches: { branch_id: string; branch_code: string; branch_name_th: string; branch_status: ActiveStatus }[];
    users: {
        user_id: string;
        user_username: string;
        fullname: string;
        user_status: ActiveStatus;
        linked_employee_id: string | null;
    }[];
};

// ─── ตั้งค่าบุคคล ───────────────────────────────────────────────────────────────────────────────

export type UnpaidLeaveDivisor = "days_30" | "working_days";

export type PayrollSettings = {
    ps_working_weekdays: string;
    ps_hours_per_day: string;
    ps_pay_day: number;
    ps_unpaid_leave_divisor: UnpaidLeaveDivisor;
    ps_timesheet_backdate_days: number;
};

export type SsoRate = {
    sr_effective_from: string;
    sr_employee_rate: string;
    sr_employer_rate: string;
    sr_wage_floor: string;
    sr_wage_ceiling: string;
    sr_note: string | null;
    is_current: boolean;
};

export type TaxBracket = { itb_from_amount: string; itb_rate: string };

export type TaxYear = {
    ity_tax_year: number;
    ity_expense_rate: string;
    ity_expense_cap: string;
    ity_personal_allowance: string;
    ity_note: string | null;
    brackets: TaxBracket[];
};

export type LeaveType = {
    lt_id: number;
    lt_name_th: string;
    lt_name_en: string | null;
    lt_days_per_year: string | null;
    lt_is_paid: boolean;
    lt_attachment_from_days: string | null;
    lt_min_service_days: number;
    lt_carry_over_days: string;
    lt_status: ActiveStatus;
    lt_sort_order: number;
};

export type PeopleSetup = {
    settings: PayrollSettings | null;
    sso_rates: SsoRate[];
    tax_years: TaxYear[];
    current_tax_year: number;
    leave_types: LeaveType[];
    today: string;
};

export type Holiday = { hd_date: string; hd_name: string };

// ─── ลงเวลา (ขั้น 4-2) ─────────────────────────────────────────────────────────────────────────

export type TimesheetStatus = "draft" | "submitted" | "approved" | "returned";

export type TimesheetEntry = {
    tse_id: number;
    tse_date: string;
    tse_project_id: string | null;
    tse_task_id: string | null;
    tse_hours: string;
    tse_note: string | null;
    tse_approved_at: string | null;
    project_name: string | null;
    task_title: string | null;
    approved_by_name: string | null;
};

export type TimesheetDay = {
    date: string;
    is_working_day: boolean;
    holiday_name: string | null;
    leave: "full" | "morning" | "afternoon" | null;
    blocked_reason: string | null;
};

export type TimesheetProjectOption = {
    project_id: string;
    project_name: string;
    project_status: string;
    is_member: boolean;
    can_log: boolean;
    tasks: { task_id: string; task_title: string; task_parent_id: string | null; task_status: string }[];
};

export type MyTimesheetWeek = {
    week_start: string;
    today: string;
    backdate_days: number;
    employee: {
        emp_id: string;
        emp_code: string;
        emp_first_name_th: string;
        emp_last_name_th: string;
        emp_hire_date: string;
        emp_termination_date: string | null;
    } | null;
    week: {
        tsw_id: number | null;
        tsw_status: TimesheetStatus;
        tsw_version: number;
        tsw_total_hours: string;
        tsw_return_reason: string | null;
    } | null;
    entries: TimesheetEntry[];
    days: TimesheetDay[];
    projects: TimesheetProjectOption[];
};

export type ApprovalWeek = {
    tsw_id: number;
    tsw_version: number;
    tsw_week_start: string;
    tsw_total_hours: string;
    tsw_submitted_at: string;
    employee_name: string;
    emp_code: string;
    emp_nickname: string | null;
    entries: {
        tse_id: number;
        tse_date: string;
        tse_project_id: string | null;
        project_name: string | null;
        task_title: string | null;
        tse_hours: string;
        tse_note: string | null;
        is_approved: boolean;
    }[];
};

// ─── การลา (ขั้น 4-3) ──────────────────────────────────────────────────────────────────────────

export type LeaveStatus = "draft" | "pending" | "approved" | "rejected" | "cancelled";
export type HalfDay = "none" | "morning" | "afternoon";

export type LeaveBalance = {
    lt_id: number;
    lt_name_th: string;
    lt_is_paid: boolean;
    lt_attachment_from_days: string | null;
    lt_min_service_days: number;
    lt_status: "active" | "inactive";
    quota: string | null;
    carried: string;
    used: string;
    pending: string;
    remaining: string | null;
};

export type LeaveAttachment = { lra_id: number; lra_file_name: string; lra_file_size: number };

export type LeaveRequest = {
    lr_id: number;
    lr_employee_id: string;
    lr_leave_type_id: number;
    lt_name_th: string;
    lt_is_paid: boolean;
    lr_start_date: string;
    lr_end_date: string;
    lr_half_day: HalfDay;
    lr_days: string;
    lr_reason: string | null;
    lr_status: LeaveStatus;
    lr_version: number;
    lr_decision_note: string | null;
    lr_cancel_reason: string | null;
    decided_by_name: string | null;
    attachment_count: number;
    attachments: LeaveAttachment[];
};

export type MyLeave = {
    year: number;
    today: string;
    employee: { emp_id: string; emp_hire_date: string; emp_termination_date: string | null } | null;
    balances: LeaveBalance[];
    requests: LeaveRequest[];
};

export type PendingLeave = LeaveRequest & {
    employee_name: string;
    emp_code: string;
    emp_nickname: string | null;
    quota: string | null;
    remaining_after_approve: string | null;
    is_over_quota: boolean;
};

export type TeamCalendar = {
    month: string;
    month_start: string;
    month_end: string;
    working_weekdays: string;
    holidays: string[];
    leaves: {
        lr_id: number;
        lr_start_date: string;
        lr_end_date: string;
        lr_half_day: HalfDay;
        lr_status: "pending" | "approved";
        employee_name: string;
    }[];
};
