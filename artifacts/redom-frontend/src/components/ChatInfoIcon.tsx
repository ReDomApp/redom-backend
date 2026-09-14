import { Svg, Path, Circle, Rect, Line, Polyline } from "react-native-svg";

type IconName = "location" | "mail" | "info" | "media" | "lock" | "privacy" | "group" | "groupAdd" | "block" | "report" | "bell" | "visibility" | "star" | "list" | "clear" | "encryption" | "qr" | "number" | "edit" | "share" | "sticker" | "ai" | "download" | "gallery" | "web" | "rotate" | "set" | "more" | "search" | "call" | "video";

export function ChatInfoIcon({ name, size = 25, color = "#667085" }: { name: IconName; size?: number; color?: string }) {
  const common = { stroke: color, strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return <Svg width={size} height={size} viewBox="0 0 28 28">
    {name === "location" ? <><Path d="M14 25s7-7.1 7-13A7 7 0 1 0 7 12c0 5.9 7 13 7 13Z" {...common}/><Circle cx="14" cy="12" r="2.3" {...common}/></> : null}
    {name === "mail" ? <><Rect x="3" y="5" width="22" height="18" rx="2" {...common}/><Polyline points="4,7 14,15 24,7" {...common}/></> : null}
    {name === "info" ? <><Circle cx="14" cy="14" r="10.5" {...common}/><Line x1="14" y1="12" x2="14" y2="20" {...common}/><Circle cx="14" cy="8.2" r="1" fill={color}/></> : null}
    {name === "media" ? <><Rect x="4" y="6" width="20" height="17" rx="2" {...common}/><Circle cx="10" cy="11" r="1.4" {...common}/><Polyline points="6,20 11,15 15,18 18,14 22,20" {...common}/></> : null}
    {name === "lock" ? <><Rect x="6" y="12" width="16" height="12" rx="2" {...common}/><Path d="M9 12V9a5 5 0 0 1 10 0v3" {...common}/><Circle cx="14" cy="18" r="1.4" {...common}/></> : null}
    {name === "privacy" ? <><Path d="M14 3 23 7v6c0 6-3.8 10-9 12-5.2-2-9-6-9-12V7l9-4Z" {...common}/><Path d="m9 14 3 3 7-7" {...common}/></> : null}
    {name === "group" ? <><Circle cx="10" cy="10" r="3" {...common}/><Circle cx="19" cy="11" r="2.6" {...common}/><Path d="M4 23c.7-4 2.7-6 6-6s5.3 2 6 6" {...common}/><Path d="M16 18c3.8-.1 6.1 1.6 7 5" {...common}/></> : null}
    {name === "groupAdd" ? <><Circle cx="10" cy="10" r="3" {...common}/><Path d="M4 23c.7-4 2.7-6 6-6s5.3 2 6 6" {...common}/><Line x1="20" y1="9" x2="20" y2="16" {...common}/><Line x1="16.5" y1="12.5" x2="23.5" y2="12.5" {...common}/></> : null}
    {name === "block" ? <><Circle cx="14" cy="14" r="10" {...common}/><Line x1="7" y1="7" x2="21" y2="21" {...common}/></> : null}
    {name === "report" ? <><Path d="M5 6h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H11l-5 4v-4a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z" {...common}/><Line x1="14" y1="10" x2="14" y2="14" {...common}/><Circle cx="14" cy="17" r=".8" fill={color}/></> : null}
    {name === "bell" ? <><Path d="M6 19h16l-2-3v-5a6 6 0 0 0-12 0v5l-2 3Z" {...common}/><Path d="M11 23h6" {...common}/></> : null}
    {name === "visibility" ? <><Path d="M3 14s4-7 11-7 11 7 11 7-4 7-11 7S3 14 3 14Z" {...common}/><Circle cx="14" cy="14" r="3" {...common}/></> : null}
    {name === "star" ? <Path d="m14 4 2.8 5.8 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L5 10.7l6.2-.9L14 4Z" {...common}/> : null}
    {name === "list" ? <><Line x1="8" y1="8" x2="23" y2="8" {...common}/><Line x1="8" y1="14" x2="23" y2="14" {...common}/><Line x1="8" y1="20" x2="23" y2="20" {...common}/><Circle cx="4" cy="8" r=".8" fill={color}/><Circle cx="4" cy="14" r=".8" fill={color}/><Circle cx="4" cy="20" r=".8" fill={color}/></> : null}
    {name === "clear" ? <><Rect x="6" y="7" width="16" height="17" rx="2" {...common}/><Line x1="4" y1="7" x2="24" y2="7" {...common}/><Line x1="10" y1="4" x2="18" y2="4" {...common}/><Line x1="11" y1="11" x2="11" y2="20" {...common}/><Line x1="17" y1="11" x2="17" y2="20" {...common}/></> : null}
    {name === "encryption" ? <><Rect x="5" y="11" width="18" height="13" rx="2" {...common}/><Path d="M9 11V8a5 5 0 0 1 10 0v3" {...common}/><Circle cx="14" cy="17" r="1.4" {...common}/></> : null}
    {name === "qr" ? <><Rect x="3" y="3" width="7" height="7" {...common}/><Rect x="18" y="3" width="7" height="7" {...common}/><Rect x="3" y="18" width="7" height="7" {...common}/><Rect x="18" y="18" width="3" height="3" {...common}/><Rect x="23" y="23" width="2" height="2" {...common}/><Rect x="13" y="13" width="3" height="3" fill={color}/></> : null}
    {name === "number" ? <><Rect x="4" y="4" width="20" height="20" rx="3" {...common}/><Line x1="9" y1="9" x2="9" y2="19" {...common}/><Line x1="19" y1="9" x2="19" y2="19" {...common}/><Line x1="7" y1="12" x2="21" y2="12" {...common}/><Line x1="7" y1="16" x2="21" y2="16" {...common}/></> : null}
    {name === "edit" ? <Path d="m5 20 1.2-4.4L18.8 3a2.5 2.5 0 0 1 3.5 3.5L9.7 20.9 5 22l.3-2Z" {...common}/> : null}
    {name === "share" ? <><Circle cx="7" cy="14" r="2.5" {...common}/><Circle cx="21" cy="7" r="2.5" {...common}/><Circle cx="21" cy="21" r="2.5" {...common}/><Line x1="9" y1="13" x2="18.5" y2="8" {...common}/><Line x1="9" y1="15" x2="18.5" y2="20" {...common}/></> : null}
    {name === "sticker" ? <><Path d="M5 5h12l6 6v12H5V5Z" {...common}/><Path d="M17 5v6h6" {...common}/><Circle cx="11" cy="14" r="1" fill={color}/><Circle cx="15" cy="14" r="1" fill={color}/></> : null}
    {name === "ai" ? <><Circle cx="14" cy="14" r="7" {...common}/><Circle cx="14" cy="14" r="2" fill={color}/><Path d="M14 2v4M14 22v4M2 14h4M22 14h4M5.5 5.5l2.8 2.8M19.7 19.7l2.8 2.8" {...common}/></> : null}
    {name === "download" ? <><Path d="M14 4v12" {...common}/><Polyline points="9,12 14,17 19,12" {...common}/><Path d="M5 21h18" {...common}/></> : null}
    {name === "gallery" ? <><Rect x="4" y="6" width="17" height="16" rx="2" {...common}/><Rect x="8" y="3" width="16" height="16" rx="2" {...common}/><Circle cx="13" cy="8" r="1.3" {...common}/></> : null}
    {name === "web" ? <><Circle cx="14" cy="14" r="10" {...common}/><Path d="M4 14h20M14 4c3 3 3 17 0 20M14 4c-3 3-3 17 0 20" {...common}/></> : null}
    {name === "rotate" ? <><Path d="M7 10a8 8 0 0 1 13-2l2 2" {...common}/><Polyline points="18,5 22,10 17,10" {...common}/><Path d="M21 18a8 8 0 0 1-13 2l-2-2" {...common}/><Polyline points="10,23 6,18 11,18" {...common}/></> : null}
    {name === "set" ? <><Rect x="4" y="4" width="20" height="20" rx="2" {...common}/><Circle cx="14" cy="14" r="5" {...common}/><Circle cx="14" cy="14" r="1.2" fill={color}/></> : null}
    {name === "more" ? <><Circle cx="14" cy="6" r="1.4" fill={color}/><Circle cx="14" cy="14" r="1.4" fill={color}/><Circle cx="14" cy="22" r="1.4" fill={color}/></> : null}
    {name === "search" ? <><Circle cx="12" cy="12" r="7" {...common}/><Line x1="17" y1="17" x2="23" y2="23" {...common}/></> : null}
    {name === "call" ? <Path d="M7 5c1.5-1 3.3.2 4 1.8l1 2.3-2 1.8c1.1 2.1 2.6 3.5 4.7 4.7l1.8-2 2.3 1c1.6.7 2.8 2.5 1.8 4-1 1.5-2.5 2.5-4.3 2.2C10.5 20.8 7.2 17.5 6 12.7 5.5 10.9 5.5 6 7 5Z" {...common}/> : null}
    {name === "video" ? <><Rect x="3" y="7" width="15" height="14" rx="2" {...common}/><Path d="m18 12 7-4v12l-7-4" {...common}/></> : null}
  </Svg>;
}
