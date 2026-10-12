import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const BARCODE_BUF_KEY = "__posBarcodeBuf";

type WindowWithBuf = Window & { [BARCODE_BUF_KEY]?: string };

/**
 * USB keyboard-wedge scanner + optional camera barcode reader.
 * Ignores keystrokes while focus is in form fields unless camera mode is on.
 */
export function useBarcodeScan(onScan: (code: string) => void) {
  const [useCamera, setUseCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (useCamera) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) {
        return;
      }

      const w = window as WindowWithBuf;
      w[BARCODE_BUF_KEY] = (w[BARCODE_BUF_KEY] || "") + e.key;
      if (e.key === "Enter") {
        const code = (w[BARCODE_BUF_KEY] || "").replace(/Enter$/, "");
        w[BARCODE_BUF_KEY] = "";
        if (code.trim()) onScanRef.current(code.trim());
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [useCamera]);

  useEffect(() => {
    if (!useCamera || !videoRef.current) return;

    const reader = new BrowserMultiFormatReader();
    let controls: { stop: () => void } | undefined;
    let stopped = false;

    void (async () => {
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const deviceId = devices[0]?.deviceId;
      if (!deviceId || stopped || !videoRef.current) return;

      controls = await reader.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (res) => {
          if (stopped || !res) return;
          onScanRef.current(res.getText());
        }
      );
    })();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [useCamera]);

  const toggleCamera = useCallback(() => {
    setUseCamera((v) => !v);
  }, []);

  return { useCamera, setUseCamera, toggleCamera, videoRef };
}
