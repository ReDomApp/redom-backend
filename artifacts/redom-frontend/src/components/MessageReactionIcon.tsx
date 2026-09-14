import { Svg, Circle, Path, Line } from "react-native-svg";
import type { MessageReactionType } from "../messages/messageService";

export function MessageReactionIcon({ type, size = 22, color = "#667085" }: { type: MessageReactionType; size?: number; color?: string }) {
  const common = { stroke: color, strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  if (type === "like") return <Svg width={size} height={size} viewBox="0 0 28 28"><Path d="M8 12v12H4V12h4Zm2 12V12l5-9c.5-.8 1.8-.6 2 .4l.3 1.6-1 4H22c1.5 0 2.5 1.4 2 2.8L21.8 22c-.4 1.2-1.5 2-2.8 2H10Z" {...common}/></Svg>;
  if (type === "love") return <Svg width={size} height={size} viewBox="0 0 28 28"><Path d="M14 24S4 18 4 10.5C4 6.8 8.7 5 11.2 8.3 13.7 5 18.4 6.8 18.4 10.5 18.4 18 14 24 14 24Z" fill={color} opacity={0.18}/><Path d="M14 24S4 18 4 10.5C4 6.8 8.7 5 11.2 8.3 13.7 5 18.4 6.8 18.4 10.5 18.4 18 14 24 14 24Z" {...common}/></Svg>;
  if (type === "haha") return <Svg width={size} height={size} viewBox="0 0 28 28"><Circle cx="14" cy="14" r="10" {...common}/><Path d="M8 17c2 3 10 3 12 0" {...common}/><Line x1="9" y1="11" x2="12" y2="12" {...common}/><Line x1="16" y1="12" x2="19" y2="11" {...common}/></Svg>;
  if (type === "wow") return <Svg width={size} height={size} viewBox="0 0 28 28"><Circle cx="14" cy="14" r="10" {...common}/><Circle cx="11" cy="11" r="1.4" fill={color}/><Circle cx="17" cy="11" r="1.4" fill={color}/><Circle cx="14" cy="17" r="2.5" {...common}/></Svg>;
  if (type === "sad") return <Svg width={size} height={size} viewBox="0 0 28 28"><Circle cx="14" cy="14" r="10" {...common}/><Circle cx="11" cy="11" r="1.2" fill={color}/><Circle cx="17" cy="11" r="1.2" fill={color}/><Path d="M10 20c2-3 6-3 8 0" {...common}/></Svg>;
  return <Svg width={size} height={size} viewBox="0 0 28 28"><Circle cx="14" cy="14" r="10" {...common}/><Circle cx="11" cy="11" r="1.2" fill={color}/><Circle cx="17" cy="11" r="1.2" fill={color}/><Path d="M10 19c2-1 6-1 8 0" {...common}/><Path d="M6 7 9 5M22 7l-3-2" {...common}/></Svg>;
}
