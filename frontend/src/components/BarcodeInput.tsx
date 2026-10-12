import { useBarcodeScan } from "../hooks/useBarcodeScan";

export default function BarcodeInput({ onScan }: { onScan: (code: string) => void }) {
  const { useCamera, toggleCamera, videoRef } = useBarcodeScan(onScan);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button type="button" onClick={toggleCamera}>
        {useCamera ? "Use Scanner" : "Use Camera"}
      </button>
      {useCamera && (
        <video ref={videoRef} style={{ width: 320, height: 240 }} />
      )}
    </div>
  );
}
