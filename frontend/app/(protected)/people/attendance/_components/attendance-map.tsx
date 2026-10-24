"use client";

// แผนที่จุดลงเวลา (2026-10-24) — วงรัศมีของแต่ละจุด + ตำแหน่งของฉันพร้อมวงความแม่นยำ GPS
// ใช้ Leaflet + แผนที่ OpenStreetMap (ไม่ต้องมี API key · ต้องแสดงเครดิต © OpenStreetMap)
// โหลด leaflet ในเบราว์เซอร์เท่านั้น (ใช้ window) · มือถือปิดการลากด้วยนิ้วเดียว ให้เลื่อนหน้าได้ปกติ ซูมด้วยสองนิ้วหรือปุ่ม +/-
// onPick = แตะแผนที่เพื่อย้ายจุด (ใช้ในฟอร์มตั้งค่าจุดลงเวลา) · ผู้เรียกต้อง useMemo locations/myPosition ไม่งั้นซูมใหม่ทุกครั้งที่ render
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapLocation = {
    id: number | string;
    name: string;
    latitude: number;
    longitude: number;
    radius: number;
    isActive: boolean;
};

export type MapPosition = { latitude: number; longitude: number; accuracy: number | null };

// สีตามธีม (Tailwind blue-600 / gray-400 / gray-700)
const ACTIVE_COLOR = "#2563eb";
const INACTIVE_COLOR = "#9ca3af";
const MY_COLOR = "#374151";
// ไม่มีพิกัดอะไรเลย: เปิดที่กรุงเทพ
const FALLBACK_CENTER: [number, number] = [13.7563, 100.5018];
const FALLBACK_ZOOM = 11;
const MAX_FIT_ZOOM = 17;

export default function AttendanceMap({
    locations,
    myPosition = null,
    onPick,
    className = "h-56",
}: {
    locations: MapLocation[];
    myPosition?: MapPosition | null;
    onPick?: (latitude: number, longitude: number) => void;
    className?: string;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<LeafletMap | null>(null);
    const layersRef = useRef<LayerGroup | null>(null);
    const leafletRef = useRef<typeof import("leaflet") | null>(null);
    const onPickRef = useRef(onPick);
    const drawRef = useRef<() => void>(() => {});

    useEffect(() => {
        onPickRef.current = onPick;
    }, [onPick]);

    // วาดวงรัศมีและตำแหน่งของฉันใหม่ทุกครั้งที่ข้อมูลเปลี่ยน แล้วซูมให้เห็นครบ
    useEffect(() => {
        drawRef.current = () => {
            const L = leafletRef.current;
            const map = mapRef.current;
            const layers = layersRef.current;
            if (!L || !map || !layers) return;
            layers.clearLayers();
            const bounds = L.latLngBounds([]);

            for (const location of locations) {
                const color = location.isActive ? ACTIVE_COLOR : INACTIVE_COLOR;
                const center: [number, number] = [location.latitude, location.longitude];
                const circle = L.circle(center, {
                    radius: location.radius,
                    color,
                    weight: 2,
                    fillColor: color,
                    fillOpacity: 0.12,
                    interactive: false,
                }).addTo(layers);
                L.circleMarker(center, { radius: 4, color, weight: 2, fillColor: "#ffffff", fillOpacity: 1 })
                    .bindTooltip(`${location.name} · รัศมี ${location.radius} ม.`)
                    .addTo(layers);
                bounds.extend(circle.getBounds());
            }

            if (myPosition) {
                const point: [number, number] = [myPosition.latitude, myPosition.longitude];
                if (myPosition.accuracy) {
                    L.circle(point, {
                        radius: myPosition.accuracy,
                        color: MY_COLOR,
                        weight: 1,
                        dashArray: "4 4",
                        fillColor: MY_COLOR,
                        fillOpacity: 0.06,
                        interactive: false,
                    }).addTo(layers);
                }
                L.circleMarker(point, { radius: 7, color: "#ffffff", weight: 3, fillColor: MY_COLOR, fillOpacity: 1 })
                    .bindTooltip("คุณอยู่ที่นี่")
                    .addTo(layers);
                bounds.extend(point);
            }

            if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: MAX_FIT_ZOOM });
            else map.setView(FALLBACK_CENTER, FALLBACK_ZOOM);
        };
        drawRef.current();
    }, [locations, myPosition]);

    // สร้างแผนที่ครั้งเดียว (โหลด leaflet แบบ dynamic เพราะต้องใช้ window)
    useEffect(() => {
        let isUnmounted = false;
        import("leaflet").then((L) => {
            if (isUnmounted || !containerRef.current) return;
            const isTouch = window.matchMedia("(pointer: coarse)").matches;
            const map = L.map(containerRef.current, {
                center: FALLBACK_CENTER,
                zoom: FALLBACK_ZOOM,
                scrollWheelZoom: false,
                dragging: !isTouch,
                attributionControl: true,
            });
            map.attributionControl.setPrefix(false);
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution: "© OpenStreetMap contributors",
            }).addTo(map);
            map.on("click", (event) => onPickRef.current?.(event.latlng.lat, event.latlng.lng));
            leafletRef.current = L;
            mapRef.current = map;
            layersRef.current = L.layerGroup().addTo(map);
            drawRef.current();
        });
        return () => {
            isUnmounted = true;
            mapRef.current?.remove();
            mapRef.current = null;
            layersRef.current = null;
        };
    }, []);

    return (
        <div
            ref={containerRef}
            role="region"
            aria-label="แผนที่จุดลงเวลาและรัศมี"
            className={`attendance-map isolate z-0 w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100 ${
                onPick ? "cursor-crosshair" : ""
            } ${className}`}
        />
    );
}

/** จุดลงเวลาจาก API (พิกัดเป็นข้อความ) → ข้อมูลแผนที่ */
export function mapLocationsOf(
    locations: {
        al_id: number;
        al_name: string;
        al_latitude: string;
        al_longitude: string;
        al_radius_m: number;
        al_status?: string;
    }[],
): MapLocation[] {
    return locations.map((location) => ({
        id: location.al_id,
        name: location.al_name,
        latitude: Number(location.al_latitude),
        longitude: Number(location.al_longitude),
        radius: location.al_radius_m,
        isActive: (location.al_status ?? "active") === "active",
    }));
}
