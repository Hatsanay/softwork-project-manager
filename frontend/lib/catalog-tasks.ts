// สินค้า/ชุดรายการที่เลือก → งานในโปรเจกต์ (2026-10-31 · docs/plans/2026-10-31-project-tasks-from-catalog.md)
// ที่เดียวของระบบ: ตัวเลือกสินค้าตอนสร้างโปรเจกต์/รับงาน Fastwork · ตัวคิดราคา (เพิ่มเป็นงวดของงานเดิม)
// ชุดรายการ = งานหลัก · รายการในชุด = งานย่อย · สินค้าเดี่ยว = งานหลัก · สินค้าแบบ % ไม่ใช่ชิ้นงาน (ไม่สร้าง)
// ลำดับ: สินค้าเดี่ยวก่อน แล้วชุดรายการ (backend: รายการที่ตามหลังหัวข้อเป็นงานย่อยของหัวข้อนั้น)
import { formatQuantity } from "@/lib/shared/money.mjs";

export type AddedTask = { type: "heading" | "item"; description: string };

export type TaskSource =
    | { kind: "product"; name: string; quantity: number; isPercent?: boolean }
    | {
          kind: "package";
          name: string;
          quantity: number;
          items: { name: string; quantity: string; unit: string | null }[];
      };

// ตัวที่เลือกในตะกร้า/ตัวเลือก · key = "p:<product_id>" หรือ "k:<pkg_id>"
export type CatalogSelection = { key: string; quantity: number };

const withQuantity = (name: string, quantity: number) => (quantity > 1 ? `${name} × ${quantity}` : name);

function packageItemText(item: { name: string; quantity: string; unit: string | null }) {
    if (Number(item.quantity) === 1) return item.name;
    return `${item.name} × ${formatQuantity(item.quantity)}${item.unit ? ` ${item.unit}` : ""}`;
}

export function tasksFromSources(sources: TaskSource[]): AddedTask[] {
    const productTasks: AddedTask[] = [];
    const packageTasks: AddedTask[] = [];
    for (const source of sources) {
        if (source.kind === "product") {
            if (source.isPercent) continue;
            productTasks.push({ type: "item", description: withQuantity(source.name, source.quantity) });
            continue;
        }
        // ชุดจำนวน 2 = งานหลัก "× 2" ไม่สร้างงานย่อยซ้ำ 2 ชุด
        packageTasks.push({ type: "heading", description: withQuantity(source.name, source.quantity) });
        for (const item of source.items) packageTasks.push({ type: "item", description: packageItemText(item) });
    }
    return [...productTasks, ...packageTasks];
}

/** จำนวนงานหลัก/งานย่อย (รายการก่อนหัวข้อแรก = งานหลัก) */
export function countTasks(tasks: AddedTask[]) {
    let mainCount = 0;
    let subCount = 0;
    let hasHeading = false;
    for (const task of tasks) {
        if (task.type === "heading") {
            hasHeading = true;
            mainCount += 1;
        } else if (hasHeading) {
            subCount += 1;
        } else {
            mainCount += 1;
        }
    }
    return { mainCount, subCount, total: mainCount + subCount };
}

// ส่งตะกร้าจากตัวคิดราคาไปหน้ารับงานทาง URL: "p:PRD...:2,k:PKG...:1" (แค่ id + จำนวน ไม่ส่งชื่อ)
export function selectionToParam(selection: CatalogSelection[]) {
    return selection.map((row) => `${row.key}:${row.quantity}`).join(",");
}

export function selectionFromParam(value: string | null): CatalogSelection[] {
    if (!value) return [];
    const rows: CatalogSelection[] = [];
    for (const part of value.split(",")) {
        const [kind, id, quantityText] = part.split(":");
        const quantity = Number(quantityText);
        if ((kind !== "p" && kind !== "k") || !id || !Number.isInteger(quantity) || quantity < 1) continue;
        rows.push({ key: `${kind}:${id}`, quantity });
    }
    return rows;
}
