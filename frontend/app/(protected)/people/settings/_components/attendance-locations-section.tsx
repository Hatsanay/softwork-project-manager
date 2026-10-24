"use client";

// จุดลงเวลา (2026-10-23 ช่วง A-1) — พิกัด + รัศมี · ตั้งพิกัดด้วยปุ่ม "ใช้ตำแหน่งที่ยืนอยู่ตอนนี้" ไม่ต้องพิมพ์เอง
// สาขาหนึ่งมีได้หลายจุด · ปิดใช้งานแทนการลบ (การกดเก่าเก็บชื่อจุดและระยะไว้แล้ว) · ยังไม่มีจุดเลย = กดได้ทุกที่
// แผนที่ (2026-10-24): เห็นวงรัศมีของทุกจุด · ในฟอร์มแตะแผนที่เพื่อวางจุดได้ (ไม่ต้องยืนอยู่ที่ออฟฟิศ) · วงเปลี่ยนตามรัศมีที่พิมพ์
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Crosshair, ExternalLink, MapPin, Plus } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import { ActiveStatusPill } from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { attendanceLocationSchema } from "@/lib/shared/schemas/attendance.mjs";
import { ATTENDANCE_MESSAGES } from "../../_messages";
import type { ActiveStatus, AttendanceLocation, PeopleSetup } from "../../_types";
import AttendanceMap, { mapLocationsOf, type MapLocation } from "../../attendance/_components/attendance-map";
import { requestPosition } from "../../attendance/_components/use-location";

type BranchChoice = { branch_id: string; branch_name_th: string; branch_status: ActiveStatus };

function mapUrl(latitude: string | number, longitude: string | number) {
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export default function AttendanceLocationsSection({
    setup,
    canEdit,
    onChanged,
}: {
    setup: PeopleSetup;
    canEdit: boolean;
    onChanged: () => Promise<void>;
}) {
    const [editing, setEditing] = useState<AttendanceLocation | "new" | null>(null);
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

    const locations = setup.attendance_locations;
    const hasActive = locations.some((location) => location.al_status === "active");
    const mapLocations = useMemo(() => mapLocationsOf(locations), [locations]);

    return (
        <SectionCard
            icon={MapPin}
            title="จุดลงเวลา"
            description="พิกัดและรัศมีที่ถือว่าอยู่ในออฟฟิศ · นอกรัศมีกดได้แต่ต้องใส่เหตุผล"
            actions={
                canEdit && (
                    <button type="button" className={buttonClass("secondary", "md")} onClick={() => setEditing("new")}>
                        <Plus size={16} />
                        เพิ่มจุดลงเวลา
                    </button>
                )
            }
        >
            {!hasActive && <FieldHint>{ATTENDANCE_MESSAGES.noLocations}</FieldHint>}
            {editing && (
                <LocationForm
                    location={editing === "new" ? null : editing}
                    branches={branches}
                    onDone={async (saved) => {
                        setEditing(null);
                        if (saved) await onChanged();
                    }}
                />
            )}
            {locations.length > 0 && !editing && (
                <div className="grid gap-1.5">
                    <AttendanceMap locations={mapLocations} className="h-64 sm:h-80" />
                    <FieldHint>วงสีน้ำเงิน = รัศมีของจุดที่ใช้งาน · วงสีเทา = จุดที่ปิดใช้งาน · แตะจุดกลางวงเพื่อดูชื่อ</FieldHint>
                </div>
            )}
            <ul className="grid gap-2 text-sm">
                {locations.map((location) => (
                    <li
                        key={location.al_id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 p-3"
                    >
                        <div className="grid min-w-0 gap-0.5">
                            <span className="font-medium text-gray-900">{location.al_name}</span>
                            <span className="text-xs text-gray-500">
                                {location.branch_name_th ? `${location.branch_name_th} · ` : ""}รัศมี {location.al_radius_m} ม. ·{" "}
                                <a
                                    href={mapUrl(location.al_latitude, location.al_longitude)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"
                                >
                                    ดูในแผนที่
                                    <ExternalLink size={12} aria-hidden="true" />
                                </a>
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <ActiveStatusPill isActive={location.al_status === "active"} />
                            {canEdit && (
                                <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setEditing(location)}>
                                    แก้ไข
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </SectionCard>
    );
}

type LocationForm = {
    al_name: string;
    al_branch_id: string;
    al_latitude: string;
    al_longitude: string;
    al_radius_m: string;
    al_status: ActiveStatus;
};

function LocationForm({
    location,
    branches,
    onDone,
}: {
    location: AttendanceLocation | null;
    branches: BranchChoice[];
    onDone: (saved: boolean) => Promise<void>;
}) {
    const [form, setForm] = useState<LocationForm>(() => ({
        al_name: location?.al_name ?? "",
        al_branch_id: location?.al_branch_id ?? "",
        al_latitude: location ? String(Number(location.al_latitude)) : "",
        al_longitude: location ? String(Number(location.al_longitude)) : "",
        al_radius_m: String(location?.al_radius_m ?? 150),
        al_status: location?.al_status ?? "active",
    }));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const [locateMessage, setLocateMessage] = useState<string | null>(null);
    const [isLocating, setIsLocating] = useState(false);

    function update<Field extends keyof LocationForm>(field: Field, value: LocationForm[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    // ยืนอยู่ที่จุดนั้นแล้วกด — ระบบเติมพิกัด (ทศนิยม 6 ตำแหน่ง ≈ 0.1 เมตร)
    function fillCurrentPosition() {
        setIsLocating(true);
        setLocateMessage(null);
        requestPosition((result) => {
            setIsLocating(false);
            if (result.kind === "ready") {
                placePoint(result.latitude, result.longitude);
                setLocateMessage(`ได้พิกัดแล้ว · ความแม่นยำประมาณ ${result.accuracy} เมตร`);
                return;
            }
            if (result.kind === "denied") setLocateMessage(ATTENDANCE_MESSAGES.gpsDenied);
            else if (result.kind === "unavailable" && result.reason === "insecure") setLocateMessage(ATTENDANCE_MESSAGES.gpsInsecure);
            else setLocateMessage("หาตำแหน่งไม่สำเร็จ ลองใหม่อีกครั้ง หรือแตะบนแผนที่ตรงจุดที่ต้องการ");
        });
    }

    // แตะแผนที่/ได้ตำแหน่ง → เติมพิกัด
    function placePoint(latitude: number, longitude: number) {
        update("al_latitude", latitude.toFixed(6));
        update("al_longitude", longitude.toFixed(6));
    }

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = attendanceLocationSchema.safeParse({
            ...form,
            al_branch_id: form.al_branch_id || null,
            al_radius_m: Number(form.al_radius_m),
        });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { error } = location
            ? await apiFetch(`/people/attendance-locations/${location.al_id}`, { method: "PUT", body: checked.data })
            : await apiFetch("/people/attendance-locations", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            toast.error(error.message);
            return;
        }
        toast.success(location ? "บันทึกจุดลงเวลาแล้ว" : "เพิ่มจุดลงเวลาแล้ว");
        await onDone(true);
    }

    const hasCoordinates = form.al_latitude !== "" && form.al_longitude !== "";
    // วงของจุดที่กำลังแก้ (ตามค่าที่พิมพ์ · พิกัดหรือรัศมีไม่ถูกต้อง = ยังไม่วาด)
    const formLatitude = Number(form.al_latitude);
    const formLongitude = Number(form.al_longitude);
    const formRadius = Number(form.al_radius_m);
    const isDrawable =
        hasCoordinates &&
        Number.isFinite(formLatitude) &&
        Number.isFinite(formLongitude) &&
        Math.abs(formLatitude) <= 90 &&
        Math.abs(formLongitude) <= 180 &&
        formRadius > 0 &&
        formRadius <= 5000;
    const formMapLocations = useMemo<MapLocation[]>(
        () =>
            isDrawable
                ? [{ id: "form", name: form.al_name || "จุดนี้", latitude: formLatitude, longitude: formLongitude, radius: formRadius, isActive: true }]
                : [],
        [isDrawable, form.al_name, formLatitude, formLongitude, formRadius],
    );

    return (
        <form onSubmit={save} noValidate className="grid gap-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4 sm:grid-cols-2">
            <FormField label="ชื่อจุด" htmlFor="al_name" required error={errors.al_name}>
                <input
                    id="al_name"
                    value={form.al_name}
                    placeholder="เช่น สำนักงานใหญ่ ชั้น 5"
                    onChange={(event) => update("al_name", event.target.value)}
                    className={inputClass(Boolean(errors.al_name))}
                />
            </FormField>
            <FormField label="สาขา" htmlFor="al_branch_id" hint="ไม่บังคับ" error={errors.al_branch_id}>
                <select
                    id="al_branch_id"
                    value={form.al_branch_id}
                    onChange={(event) => update("al_branch_id", event.target.value)}
                    className={inputClass(Boolean(errors.al_branch_id))}
                >
                    <option value="">ไม่ระบุ</option>
                    {branches
                        .filter((branch) => branch.branch_status === "active" || branch.branch_id === form.al_branch_id)
                        .map((branch) => (
                            <option key={branch.branch_id} value={branch.branch_id}>
                                {branch.branch_name_th}
                            </option>
                        ))}
                </select>
            </FormField>
            <div className="grid gap-1.5 sm:col-span-2">
                <button
                    type="button"
                    className={`${buttonClass("secondary", "md")} justify-self-start`}
                    disabled={isLocating}
                    onClick={fillCurrentPosition}
                >
                    <Crosshair size={16} />
                    {isLocating ? "กำลังหาตำแหน่ง..." : "ใช้ตำแหน่งที่ยืนอยู่ตอนนี้"}
                </button>
                <FieldHint>{locateMessage ?? ATTENDANCE_MESSAGES.locationHint}</FieldHint>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
                <AttendanceMap locations={formMapLocations} onPick={placePoint} className="h-64 sm:h-80" />
                <FieldHint>แตะบนแผนที่ตรงออฟฟิศเพื่อวางจุด (ซูมด้วยปุ่ม + หรือสองนิ้ว) · วงสีน้ำเงิน = รัศมีที่ถือว่าอยู่ในจุด</FieldHint>
            </div>
            <FormField label="ละติจูด" htmlFor="al_latitude" required error={errors.al_latitude}>
                <input
                    id="al_latitude"
                    inputMode="decimal"
                    value={form.al_latitude}
                    placeholder="เช่น 13.756331"
                    onChange={(event) => update("al_latitude", event.target.value)}
                    className={inputClass(Boolean(errors.al_latitude))}
                />
            </FormField>
            <FormField label="ลองจิจูด" htmlFor="al_longitude" required error={errors.al_longitude}>
                <input
                    id="al_longitude"
                    inputMode="decimal"
                    value={form.al_longitude}
                    placeholder="เช่น 100.501765"
                    onChange={(event) => update("al_longitude", event.target.value)}
                    className={inputClass(Boolean(errors.al_longitude))}
                />
            </FormField>
            <FormField label="รัศมี (เมตร)" htmlFor="al_radius_m" required hint="20-5,000 เมตร" error={errors.al_radius_m}>
                <input
                    id="al_radius_m"
                    inputMode="numeric"
                    value={form.al_radius_m}
                    onChange={(event) => update("al_radius_m", event.target.value)}
                    className={inputClass(Boolean(errors.al_radius_m))}
                />
            </FormField>
            {location && (
                <FormField label="สถานะ" htmlFor="al_status" error={errors.al_status}>
                    <select
                        id="al_status"
                        value={form.al_status}
                        onChange={(event) => update("al_status", event.target.value as ActiveStatus)}
                        className={inputClass(Boolean(errors.al_status))}
                    >
                        <option value="active">ใช้งาน</option>
                        <option value="inactive">ปิดใช้งาน</option>
                    </select>
                </FormField>
            )}
            {hasCoordinates && (
                <a
                    href={mapUrl(form.al_latitude, form.al_longitude)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-9 items-center gap-1 text-sm text-blue-600 hover:underline sm:col-span-2"
                >
                    ตรวจตำแหน่งในแผนที่
                    <ExternalLink size={14} aria-hidden="true" />
                </a>
            )}
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                <button type="button" className={buttonClass("secondary", "md")} onClick={() => onDone(false)}>
                    ยกเลิก
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                    {isSaving ? "กำลังบันทึก..." : location ? "บันทึกจุด" : "เพิ่มจุด"}
                </button>
            </div>
        </form>
    );
}
