import Svg, { Circle, Path, Rect } from "react-native-svg";

type Kind =
  | "back"
  | "down"
  | "check"
  | "keyboard"
  | "audio"
  | "video"
  | "add"
  | "search"
  | "more"
  | "link"
  | "qr"
  | "settings"
  | "history"
  | "approval"
  | "members"
  | "tag"
  | "list"
  | "star"
  | "clear"
  | "leave"
  | "report"
  | "copy"
  | "share"
  | "sms"
  | "email"
  | "reset"
  | "chevron"
  | "close"
  | "camera"
  | "image"
  | "emoji"
  | "sparkle"
  | "edit"
  | "trash"
  | "privacy"
  | "blocked";

type Props = {
  kind: Kind;
  size?: number;
  color?: string;
};

export function GroupActionIcon({
  kind,
  size = 24,
  color = "#667085",
}: Props) {
  const common = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };

  const icon = (() => {
    switch (kind) {
      case "back":
        return <Path d="M15 5 8 12l7 7" {...common} />;
      case "down":
        return <Path d="m6 9 6 6 6-6" {...common} />;
      case "check":
        return <Path d="m5 12 4 4L19 6" {...common} />;
      case "keyboard":
        return (
          <>
            <Rect x="3" y="6" width="18" height="12" rx="2" {...common} />
            <Path
              d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M6 14h.01M9 14h6M18 14h.01"
              {...common}
            />
          </>
        );
      case "chevron":
        return <Path d="m9 6 6 6-6 6" {...common} />;
      case "close":
        return <Path d="m6 6 12 12M18 6 6 18" {...common} />;
      case "audio":
        return <Path d="M5 12a7 7 0 0 0 14 0M8 12a4 4 0 0 0 8 0M12 3v9" {...common} />;
      case "video":
        return (
          <>
            <Rect x="3" y="6" width="13" height="12" rx="2" {...common} />
            <Path d="m16 10 5-3v10l-5-3" {...common} />
          </>
        );
      case "add":
        return (
          <>
            <Circle cx="10" cy="8" r="4" {...common} />
            <Path d="M3 20c.8-3 3-5 7-5s6.2 2 7 5M19 8v6M16 11h6" {...common} />
          </>
        );
      case "search":
        return (
          <>
            <Circle cx="10.5" cy="10.5" r="6.5" {...common} />
            <Path d="m16 16 5 5" {...common} />
          </>
        );
      case "more":
        return (
          <>
            <Circle cx="12" cy="5" r="1" fill={color} />
            <Circle cx="12" cy="12" r="1" fill={color} />
            <Circle cx="12" cy="19" r="1" fill={color} />
          </>
        );
      case "link":
        return (
          <>
            <Path d="m9 15-2 2a4 4 0 0 1-6-6l3-3a4 4 0 0 1 6 0" {...common} />
            <Path d="m15 9 2-2a4 4 0 0 1 6 6l-3 3a4 4 0 0 1-6 0" {...common} />
            <Path d="m8 12 8 0" {...common} />
          </>
        );
      case "qr":
        return (
          <>
            <Rect x="3" y="3" width="7" height="7" {...common} />
            <Rect x="14" y="3" width="7" height="7" {...common} />
            <Rect x="3" y="14" width="7" height="7" {...common} />
            <Path d="M14 14h3v3h-3zM18 18h3v3h-3zM17 14v2M14 18h2M21 14v2" {...common} />
          </>
        );
      case "settings":
        return (
          <>
            <Circle cx="12" cy="12" r="3" {...common} />
            <Path
              d="M19.4 15a1.8 1.8 0 0 0 .3 2l.1.1-1.7 1.7-.1-.1a1.8 1.8 0 0 0-2-.3 1.8 1.8 0 0 0-1 1.7v.1h-2.4v-.1a1.8 1.8 0 0 0-1-1.7 1.8 1.8 0 0 0-2 .3l-.1.1-1.7-1.7.1-.1a1.8 1.8 0 0 0 .3-2 1.8 1.8 0 0 0-1.7-1H6v-2.4h.1a1.8 1.8 0 0 0 1.7-1 1.8 1.8 0 0 0-.3-2l-.1-.1 1.7-1.7.1.1a1.8 1.8 0 0 0 2 .3 1.8 1.8 0 0 0 1-1.7V6h2.4v.1a1.8 1.8 0 0 0 1 1.7 1.8 1.8 0 0 0 2-.3l.1-.1 1.7 1.7-.1.1a1.8 1.8 0 0 0-.3 2 1.8 1.8 0 0 0 1.7 1h.1v2.4h-.1a1.8 1.8 0 0 0-1.7 1Z"
              {...common}
            />
          </>
        );
      case "history":
        return (
          <>
            <Path d="M4 11a8 8 0 1 0 2-5" {...common} />
            <Path d="M4 4v5h5M12 7v5l3 2" {...common} />
          </>
        );
      case "approval":
        return (
          <>
            <Circle cx="9" cy="9" r="4" {...common} />
            <Path d="M15 14h4M17 12v4M3 21c.7-3 2.7-4 6-4" {...common} />
          </>
        );
      case "members":
        return (
          <>
            <Circle cx="8" cy="8" r="3" {...common} />
            <Circle cx="17" cy="9" r="2.5" {...common} />
            <Path d="M2.5 20c.6-3 2.4-4.5 5.5-4.5S12.9 17 13.5 20M14 15.5c2.5-.2 5 1.2 5.5 4.5" {...common} />
          </>
        );
      case "tag":
        return (
          <>
            <Path d="M4 5h7l8 8-6 6-8-8V5Z" {...common} />
            <Circle cx="8" cy="9" r="1" {...common} />
          </>
        );
      case "list":
        return <Path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" {...common} />;
      case "star":
        return <Path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" {...common} />;
      case "clear":
        return (
          <>
            <Circle cx="12" cy="12" r="9" {...common} />
            <Path d="M7 12h10" {...common} />
          </>
        );
      case "leave":
        return <Path d="M9 5H5v14h4M13 8l4 4-4 4M7 12h10" {...common} />;
      case "report":
        return (
          <>
            <Path d="M6 3h12v18H6z" {...common} />
            <Path d="M12 7v6M12 17h.01" {...common} />
          </>
        );
      case "copy":
        return (
          <>
            <Rect x="8" y="8" width="12" height="12" rx="2" {...common} />
            <Path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" {...common} />
          </>
        );
      case "share":
        return (
          <>
            <Circle cx="18" cy="5" r="2" {...common} />
            <Circle cx="6" cy="12" r="2" {...common} />
            <Circle cx="18" cy="19" r="2" {...common} />
            <Path d="m8 11 8-5M8 13l8 5" {...common} />
          </>
        );
      case "sms":
        return <Path d="M3 5h18v12H7l-4 4V5Z" {...common} />;
      case "email":
        return (
          <>
            <Rect x="3" y="5" width="18" height="14" rx="2" {...common} />
            <Path d="m4 7 8 6 8-6" {...common} />
          </>
        );
      case "reset":
        return (
          <>
            <Path d="M4 12a8 8 0 1 0 2-5" {...common} />
            <Path d="M4 4v5h5" {...common} />
          </>
        );
      case "camera":
        return (
          <>
            <Path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z" {...common} />
            <Circle cx="12" cy="13" r="3" {...common} />
          </>
        );
      case "image":
        return (
          <>
            <Rect x="3" y="4" width="18" height="16" rx="2" {...common} />
            <Circle cx="8" cy="9" r="1.2" fill={color} />
            <Path d="m4 17 5-5 3 3 2-2 6 5" {...common} />
          </>
        );
      case "emoji":
        return (
          <>
            <Circle cx="12" cy="12" r="9" {...common} />
            <Circle cx="9" cy="10" r="1" fill={color} />
            <Circle cx="15" cy="10" r="1" fill={color} />
            <Path d="M8 14c1.2 2 6.8 2 8 0" {...common} />
          </>
        );
      case "sparkle":
        return <Path d="m7 3 1.2 3.8L12 8l-3.8 1.2L7 13l-1.2-3.8L2 8l3.8-1.2L7 3ZM17 12l.8 2.2L20 15l-2.2.8L17 18l-.8-2.2L17 12ZM18 3v4M16 5h4" {...common} />;
      case "edit":
        return <Path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20ZM14 5l3.5 3.5" {...common} />;
      case "trash":
        return (
          <>
            <Path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" {...common} />
          </>
        );
      case "privacy":
        return (
          <>
            <Path d="M7 9V7a5 5 0 0 1 10 0v2" {...common} />
            <Rect x="4" y="9" width="16" height="11" rx="2" {...common} />
            <Circle cx="12" cy="14" r="1.2" fill={color} />
            <Path d="M12 15v2" {...common} />
          </>
        );
      case "blocked":
        return (
          <>
            <Circle cx="12" cy="12" r="9" {...common} />
            <Path d="m7 7 10 10" {...common} />
          </>
        );
      default:
        return null;
    }
  })();

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {icon}
    </Svg>
  );
}
