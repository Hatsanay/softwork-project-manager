"use client";

// ตำแหน่งจากมือถือ (2026-10-23 ช่วง A-1) — ขอครั้งเดียวตอนเปิดหน้า และเมื่อกด "หาตำแหน่งใหม่" (ไม่ติดตามต่อเนื่อง · PDPA)
// เบราว์เซอร์ให้ตำแหน่งเฉพาะเว็บ https (และ localhost) · ไม่อนุญาต/หาไม่เจอ = กดได้แต่ถือเป็นนอกจุด ต้องใส่เหตุผล
// ลองแบบแม่นยำ (GPS) ก่อน · หมดเวลาหรือจับสัญญาณไม่ได้ (ในอาคารบ่อย) ลองใหม่แบบปกติ (Wi-Fi/เสาสัญญาณ) อีกครั้ง
// 2026-10-24: เคยกดไม่ได้ทั้งเว็บเพราะ next.config.ts ส่ง Permissions-Policy geolocation=() — ต้องเป็น geolocation=(self)
import { useCallback, useEffect, useState } from "react";

export type LocationState =
    | { kind: "locating" }
    | { kind: "ready"; latitude: number; longitude: number; accuracy: number }
    | { kind: "denied" }
    | { kind: "unavailable"; reason: "insecure" | "unsupported" | "timeout" | "error" };

const PRECISE_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 };
const FALLBACK_OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 };

function toReadyState(position: GeolocationPosition): LocationState {
    return {
        kind: "ready",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy),
    };
}

function toFailedState(error: GeolocationPositionError): LocationState {
    if (error.code === error.PERMISSION_DENIED) return { kind: "denied" };
    return { kind: "unavailable", reason: error.code === error.TIMEOUT ? "timeout" : "error" };
}

export function requestPosition(onResult: (state: LocationState) => void) {
    if (!window.isSecureContext) {
        onResult({ kind: "unavailable", reason: "insecure" });
        return;
    }
    if (!("geolocation" in navigator)) {
        onResult({ kind: "unavailable", reason: "unsupported" });
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (position) => onResult(toReadyState(position)),
        (preciseError) => {
            if (preciseError.code === preciseError.PERMISSION_DENIED) {
                onResult({ kind: "denied" });
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (position) => onResult(toReadyState(position)),
                (fallbackError) => onResult(toFailedState(fallbackError)),
                FALLBACK_OPTIONS,
            );
        },
        PRECISE_OPTIONS,
    );
}

export function useLocation() {
    const [state, setState] = useState<LocationState>({ kind: "locating" });

    useEffect(() => {
        let isLeftPage = false;
        requestPosition((result) => {
            if (!isLeftPage) setState(result);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    const relocate = useCallback(() => {
        setState({ kind: "locating" });
        requestPosition(setState);
    }, []);

    return { location: state, relocate };
}
