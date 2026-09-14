import Svg,{Path,Circle,Rect,Line,Polygon} from "react-native-svg";
export type AttachmentIconKind="gallery"|"camera"|"location"|"contact"|"document"|"audio"|"poll"|"event"|"voice"|"video"|"callLink"|"check";
export function AttachmentIcon({kind,size=24,color="#1877F2"}:{kind:AttachmentIconKind;size?:number;color?:string}){const p={fill:"none" as const,stroke:color,strokeWidth:2,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};return <Svg width={size} height={size} viewBox="0 0 24 24">
{kind==="gallery"&&<><Rect x="3" y="4" width="18" height="16" rx="2" {...p}/><Circle cx="8" cy="9" r="1.5" {...p}/><Path d="M4 17l5-5 3 3 2-2 6 6" {...p}/></>}
{kind==="camera"&&<><Path d="M4 7h4l2-2h4l2 2h4v12H4z" {...p}/><Circle cx="12" cy="13" r="3.5" {...p}/></>}
{kind==="location"&&<><Path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" {...p}/><Circle cx="12" cy="10" r="2.2" {...p}/></>}
{kind==="contact"&&<><Circle cx="12" cy="8" r="3" {...p}/><Path d="M5 20c.8-3.2 3.2-5 7-5s6.2 1.8 7 5" {...p}/></>}
{kind==="document"&&<><Path d="M6 3h8l4 4v14H6z" {...p}/><Path d="M14 3v5h5M9 13h6M9 17h6" {...p}/></>}
{kind==="audio"&&<><Path d="M5 8v8M9 5v14M13 9v6M17 7v10M21 10v4" {...p}/></>}
{kind==="poll"&&<><Rect x="4" y="5" width="16" height="14" rx="2" {...p}/><Path d="M8 10h8M8 14h5" {...p}/><Circle cx="17" cy="14" r="1" fill={color}/></>}
{kind==="event"&&<><Rect x="4" y="5" width="16" height="15" rx="2" {...p}/><Path d="M8 3v4M16 3v4M4 9h16M8 13h3M8 16h5" {...p}/></>}
{kind==="voice"&&<><Path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3zM6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6" {...p}/></>}
{kind==="video"&&<><Rect x="3" y="6" width="13" height="12" rx="2" {...p}/><Path d="M16 10l5-3v10l-5-3z" {...p}/></>}
{kind==="callLink"&&<><Path d="M9 15l6-6" {...p}/><Path d="M7 17H5a3 3 0 0 1 0-6h3M17 7h2a3 3 0 0 1 0 6h-3" {...p}/></>}
{kind==="check"&&<Path d="M5 12l4 4L19 6" {...p}/>} 
</Svg>}
