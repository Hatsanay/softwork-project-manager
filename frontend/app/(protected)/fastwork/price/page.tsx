// ตัวคิดราคาย้ายไป ขาย › ตัวคิดราคา (2026-11-01 · docs/plans/2026-11-01-calculator-direct-quotation.md) · ลิงก์เดิมพามาโหมด Fastwork
import { redirect } from "next/navigation";

export default function FastworkPriceRedirect() {
    redirect("/sales/price-calculator?mode=fastwork");
}
