import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Svg, Rect } from "react-native-svg";

export function ReDomQrCode({ value, size = 250 }: { value: string; size?: number }) {
  const [matrix, setMatrix] = useState<number[][] | null>(null);
  useEffect(() => { let active = true; try { const qr = QRCode.create(value, { errorCorrectionLevel: "M" }); const count = qr.modules.size; const cells: number[][] = []; for (let y = 0; y < count; y++) { const row: number[] = []; for (let x = 0; x < count; x++) row.push(qr.modules.get(x, y) ? 1 : 0); cells.push(row); } if (active) setMatrix(cells); } catch { if (active) setMatrix(null); } return () => { active = false; }; }, [value]);
  if (!matrix) return null;
  const count = matrix.length; const quiet = 2; const cell = size / (count + quiet * 2);
  return <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}><Rect width={size} height={size} fill="#FFF" />{matrix.flatMap((row, y) => row.map((filled, x) => filled ? <Rect key={`${x}-${y}`} x={(x + quiet) * cell} y={(y + quiet) * cell} width={cell + 0.2} height={cell + 0.2} fill="#111" /> : null))}</Svg>;
}
