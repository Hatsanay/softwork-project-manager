"use client";

// แท็บคำถามลูกค้า (2026-10-25 · S-2 · Q-1 เงื่อนไขการถาม · Q-2 เครื่องมือตั้งค่า 2026-10-26 docs/plans/2026-10-26-customer-questions.md ข้อ 4)
// การ์ดกลุ่มบอกเป็นประโยคว่าลูกค้าคนไหนเห็น + คำเตือนที่ระบบตรวจให้ · ค้นหา · กรองเฉพาะที่มีคำเตือน · ดูมุมมองลูกค้า
// เรียงกลุ่ม/คำถามด้วยปุ่มขึ้นลง · คัดลอกกลุ่ม (สำเนาปิดไว้ก่อน) · คัดลอก/ย้ายคำถาม
// แก้ได้เฉพาะ productManagement · ลบคำถามแล้วคำตอบในคำขอเดิมยังอ่านได้ (เก็บข้อความคำถามไว้ตอนลูกค้าส่ง)
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, Plus, Search } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/empty-state";
import { inputClass } from "@/components/ui/form-field";
import HowItWorks from "@/components/ui/guidance/how-it-works";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import type { RequirementGroup, RequirementQuestion } from "@/app/order/_types";
import type { ProductCategory } from "../_types";
import CustomerPreviewSheet from "./customer-preview-sheet";
import MoveQuestionSheet from "./move-question-sheet";
import RequirementGroupCard from "./requirement-group-card";
import RequirementGroupSheet from "./requirement-group-sheet";
import RequirementQuestionSheet from "./requirement-question-sheet";
import { groupAudienceText, type LinkableItems } from "./requirement-labels";
import { questionnaireWarnings, warningCount } from "./requirement-warnings";
import type { QuestionsTarget } from "./item-questions-panel";
import type { ScenarioLink } from "./requirement-scenario";

type LinkNames = {
    client_name: string | null;
    project_name: string | null;
    ol_buyer_name: string | null;
    ol_name: string | null;
    ol_short_code: string;
};

const LINK_KIND_NAME: Record<ScenarioLink["ol_kind"], string> = {
    personal: "เฉพาะลูกค้า",
    public: "สาธารณะ",
    fastwork: "Fastwork",
};

/** ชื่อลิงก์ในตัวเลือก เช่น "Fastwork · หัสนัย หม้อยา (/o/323JYPCE)" */
function linkLabel(link: Omit<ScenarioLink, "label"> & LinkNames) {
    const name = link.client_name ?? link.project_name ?? link.ol_buyer_name ?? link.ol_name ?? "ลูกค้าใหม่";
    return `${LINK_KIND_NAME[link.ol_kind]} · ${name} (/o/${link.ol_short_code})`;
}

type SheetState =
    | { kind: "group"; group: RequirementGroup | null; initialItem?: { kind: "product" | "package"; id: string } }
    | { kind: "question"; group: RequirementGroup; question: RequirementQuestion | null }
    | { kind: "move"; group: RequirementGroup; question: RequirementQuestion }
    | { kind: "preview" }
    | null;

export default function QuestionsTab({
    categories,
    canEdit,
    target = null,
}: {
    categories: ProductCategory[];
    canEdit: boolean;
    target?: QuestionsTarget | null;
}) {
    const [groups, setGroups] = useState<RequirementGroup[] | null>(null);
    const [items, setItems] = useState<LinkableItems>({ packages: [], products: [] });
    // ลิงก์สำหรับ "ใช้ค่าจากลิงก์" ในดูมุมมองลูกค้า · ไม่มีสิทธิ์ดูลิงก์ = ไม่มีตัวเลือกนี้ (ไม่ใช่ข้อผิดพลาด)
    const [links, setLinks] = useState<ScenarioLink[]>([]);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    // มาจากแผ่นแก้สินค้า/ชุด "เพิ่มกลุ่มคำถามสำหรับรายการนี้" → เปิดแผ่นเพิ่มกลุ่มที่ผูกรายการนั้นไว้แล้ว
    const [sheet, setSheet] = useState<SheetState>(() =>
        target && "createFor" in target && canEdit
            ? { kind: "group", group: null, initialItem: target.createFor }
            : null,
    );
    const focusGroupId = target && "groupId" in target ? target.groupId : null;
    const [search, setSearch] = useState("");
    const [isWarningsOnly, setIsWarningsOnly] = useState(false);
    const [deleting, setDeleting] = useState<{ label: string; path: string } | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const load = useCallback(async () => {
        const { data, error } = await apiFetch<{ data: RequirementGroup[] }>("/requirement-groups");
        setLoadError(error);
        if (data) setGroups(data.data);
    }, []);

    useEffect(() => {
        let isLeftPage = false;
        Promise.all([
            apiFetch<{ data: RequirementGroup[] }>("/requirement-groups"),
            apiFetch<{ data: LinkableItems["packages"] }>("/product-packages"),
            apiFetch<{ data: LinkableItems["products"] }>("/products?limit=200&status=active"),
            apiFetch<{ data: (Omit<ScenarioLink, "label"> & LinkNames)[] }>("/order-links"),
        ]).then(([groupResult, packageResult, productResult, linkResult]) => {
            if (isLeftPage) return;
            setLoadError(groupResult.error);
            if (groupResult.data) setGroups(groupResult.data.data);
            setItems({ packages: packageResult.data?.data ?? [], products: productResult.data?.data ?? [] });
            setLinks((linkResult.data?.data ?? []).map((link) => ({ ...link, label: linkLabel(link) })));
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    // มาจากแผ่นแก้สินค้า/ชุด ("แก้คำถาม") → เลื่อนไปกลุ่มนั้นหลังโหลดเสร็จ
    useEffect(() => {
        if (!groups || !focusGroupId) return;
        document
            .getElementById(`requirement-group-${focusGroupId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [groups, focusGroupId]);

    async function send(path: string, method: "POST" | "PUT", body: unknown, doneMessage: string) {
        const { error } = await apiFetch(path, { method, body });
        if (error) {
            toast.error(error.message);
            await load();
            return;
        }
        toast.success(doneMessage);
        await load();
    }

    function moveGroup(index: number, offset: number) {
        if (!groups) return;
        const order = groups.map((group) => group.rqg_id);
        const target = index + offset;
        if (target < 0 || target >= order.length) return;
        [order[index], order[target]] = [order[target], order[index]];
        void send("/requirement-group-order", "PUT", { group_ids: order }, "เรียงกลุ่มแล้ว");
    }

    function moveQuestion(group: RequirementGroup, index: number, offset: number) {
        const order = group.questions.map((question) => question.rqq_id);
        const target = index + offset;
        if (target < 0 || target >= order.length) return;
        [order[index], order[target]] = [order[target], order[index]];
        void send(
            `/requirement-groups/${group.rqg_id}/question-order`,
            "PUT",
            { question_ids: order },
            "เรียงคำถามแล้ว",
        );
    }

    async function confirmDelete() {
        if (!deleting) return;
        setIsDeleting(true);
        const { error } = await apiFetch(deleting.path, { method: "DELETE" });
        setIsDeleting(false);
        if (error) {
            setDeleteError(error.message);
            return;
        }
        toast.success(`ลบ${deleting.label}แล้ว`);
        setDeleting(null);
        await load();
    }

    if (loadError) {
        return (
            <StatusBanner
                tone={loadError.status === 403 ? "info" : "error"}
                title={loadError.status === 403 ? "ต้องมีสิทธิ์จัดการสินค้าหรือคำขอบริการ" : "โหลดคำถามไม่สำเร็จ"}
            >
                {loadError.status === 403 ? undefined : loadError.message}
            </StatusBanner>
        );
    }
    if (!groups) return <p className="text-sm text-gray-500">กำลังโหลด...</p>;

    const warnings = questionnaireWarnings(groups, categories, items);
    const totalWarnings = groups.reduce((sum, group) => sum + warningCount(warnings.get(group.rqg_id)), 0);
    const keyword = search.trim().toLowerCase();
    const matchesSearch = (group: RequirementGroup) =>
        keyword === "" ||
        group.rqg_name.toLowerCase().includes(keyword) ||
        group.questions.some((question) => question.rqq_text.toLowerCase().includes(keyword));
    const shownGroups = groups.filter(
        (group) => matchesSearch(group) && (!isWarningsOnly || warningCount(warnings.get(group.rqg_id)) > 0),
    );

    return (
        <div className="grid gap-5">
            <HowItWorks label="คำถามขึ้นให้ลูกค้าอย่างไร">
                <p>
                    กลุ่มขึ้นให้ลูกค้าตาม &quot;ถามเมื่อไหร่&quot;: ถามทุกคำขอ · เมื่อลูกค้าเลือก (หรือทีมงานเลือกให้)
                    หมวด ชุด หรือสินค้าที่ผูกไว้ · หรือไม่ถามเอง ใช้กับลิงก์ที่เลือกถามเพิ่ม
                </p>
                <p>
                    แต่ละกลุ่มและคำถามเลือกได้ว่าถามในลิงก์แบบไหน (ลิงก์ Fastwork ห้ามถามช่องทางติดต่อนอกแพลตฟอร์ม) ·
                    คำถามตั้งให้ถามเมื่อข้อด้านบนตอบตรงค่าที่เลือกได้ ข้อนั้นจะขึ้นใต้ข้อด้านบนทันทีที่ลูกค้าตอบ
                </p>
                <p>
                    ปุ่มบนการ์ด: ลูกศร = เรียงลำดับ (ลำดับเดียวกับที่ลูกค้าเห็น) · คัดลอก = ทำสำเนา
                    (สำเนากลุ่มปิดไว้ก่อน ลูกค้าไม่เห็นจนกว่าจะเปิด) · โฟลเดอร์ = ย้ายคำถามไปกลุ่มอื่น
                    (ข้อที่ถามตามข้อนั้นย้ายตาม)
                </p>
                <p>
                    กล่องสีเหลือง = สิ่งที่ระบบตรวจเจอและควรดู (ไม่บังคับแก้) · กด &quot;ดูมุมมองลูกค้า&quot;
                    เพื่อลองเลือกชุด/สินค้าแล้วดูคำถามแบบที่ลูกค้าเห็นจริง
                </p>
                <p>แก้หรือลบคำถามแล้ว คำตอบในคำขอเดิมยังอ่านได้ตามคำถามเดิม</p>
            </HowItWorks>

            <div className="flex flex-wrap items-center gap-2">
                {canEdit && (
                    <button
                        type="button"
                        className={buttonClass("primary", "md")}
                        onClick={() => setSheet({ kind: "group", group: null })}
                    >
                        <Plus size={16} />
                        เพิ่มกลุ่มคำถาม
                    </button>
                )}
                <button
                    type="button"
                    className={buttonClass("secondary", "md")}
                    onClick={() => setSheet({ kind: "preview" })}
                    disabled={groups.length === 0}
                >
                    <Eye size={16} />
                    ดูมุมมองลูกค้า
                </button>
                <div className="relative min-w-0 flex-1 basis-56">
                    <Search
                        size={16}
                        className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400"
                        aria-hidden="true"
                    />
                    <input
                        aria-label="ค้นหากลุ่มหรือคำถาม"
                        placeholder="ค้นหากลุ่มหรือคำถาม"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className={`${inputClass(false)} pl-10`}
                    />
                </div>
                <label
                    className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${isWarningsOnly ? "border-amber-200 bg-amber-50 text-amber-600" : "border-gray-200 text-gray-700"}`}
                >
                    <input
                        type="checkbox"
                        className="h-4 w-4 accent-amber-600"
                        checked={isWarningsOnly}
                        onChange={(event) => setIsWarningsOnly(event.target.checked)}
                    />
                    มีคำเตือน ({totalWarnings})
                </label>
            </div>

            {groups.length === 0 && (
                <EmptyState title="ยังไม่มีคำถาม" description='กด "เพิ่มกลุ่มคำถาม" แล้วเพิ่มคำถามที่ควรถามลูกค้า' />
            )}
            {groups.length > 0 && shownGroups.length === 0 && (
                <p className="text-sm text-gray-500">ไม่พบกลุ่มที่ตรงกับที่ค้นหา</p>
            )}
            {shownGroups.map((group) => {
                const index = groups.indexOf(group);
                return (
                    <RequirementGroupCard
                        key={group.rqg_id}
                        group={group}
                        description={groupAudienceText(group, categories, items)}
                        warnings={warnings.get(group.rqg_id)}
                        canEdit={canEdit}
                        isFirst={index === 0}
                        isLast={index === groups.length - 1}
                        isFocused={group.rqg_id === focusGroupId}
                        onMoveGroup={(offset) => moveGroup(index, offset)}
                        onCopyGroup={() =>
                            void send(
                                `/requirement-groups/${group.rqg_id}/copy`,
                                "POST",
                                {},
                                "คัดลอกกลุ่มแล้ว (สำเนาปิดใช้งานไว้ เปิดได้ที่แก้กลุ่ม)",
                            )
                        }
                        onEditGroup={() => setSheet({ kind: "group", group })}
                        onAddQuestion={() => setSheet({ kind: "question", group, question: null })}
                        onEditQuestion={(question) => setSheet({ kind: "question", group, question })}
                        onCopyQuestion={(question) =>
                            void send(
                                `/requirement-questions/${question.rqq_id}/copy`,
                                "POST",
                                {},
                                "คัดลอกคำถามไว้ท้ายกลุ่มแล้ว",
                            )
                        }
                        onMoveQuestionToGroup={(question) => setSheet({ kind: "move", group, question })}
                        onDeleteQuestion={(question) =>
                            setDeleting({ label: "คำถาม", path: `/requirement-questions/${question.rqq_id}` })
                        }
                        onMoveQuestion={(questionIndex, offset) => moveQuestion(group, questionIndex, offset)}
                    />
                );
            })}

            {sheet?.kind === "group" && (
                <RequirementGroupSheet
                    group={sheet.group}
                    initialItem={sheet.initialItem}
                    categories={categories}
                    items={items}
                    onClose={() => setSheet(null)}
                    onSaved={load}
                    onDelete={(group) => {
                        setSheet(null);
                        setDeleting({ label: `กลุ่ม ${group.rqg_name}`, path: `/requirement-groups/${group.rqg_id}` });
                    }}
                />
            )}
            {sheet?.kind === "question" && (
                <RequirementQuestionSheet
                    group={sheet.group}
                    question={sheet.question}
                    onClose={() => setSheet(null)}
                    onSaved={load}
                />
            )}
            {sheet?.kind === "move" && (
                <MoveQuestionSheet
                    question={sheet.question}
                    group={sheet.group}
                    groups={groups}
                    onClose={() => setSheet(null)}
                    onSaved={load}
                />
            )}
            {sheet?.kind === "preview" && (
                <CustomerPreviewSheet
                    groups={groups}
                    categories={categories}
                    items={items}
                    links={links}
                    onClose={() => setSheet(null)}
                />
            )}
            <ConfirmDialog
                open={deleting !== null}
                title={`ลบ${deleting?.label ?? ""}?`}
                consequences={[
                    "คำตอบในคำขอที่ส่งไปแล้วยังอ่านได้ตามคำถามเดิม",
                    "ลูกค้าที่เปิดลิงก์หลังจากนี้จะไม่เห็นอีก (ปิดใช้งานแทนได้ถ้าอยากเก็บไว้)",
                ]}
                confirmLabel="ลบ"
                loading={isDeleting}
                errorMessage={deleteError}
                onConfirm={confirmDelete}
                onCancel={() => {
                    setDeleting(null);
                    setDeleteError(null);
                }}
            />
        </div>
    );
}
