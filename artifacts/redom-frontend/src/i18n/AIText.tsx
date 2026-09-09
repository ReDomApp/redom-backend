import React, { useEffect, useState } from "react";
import { Text, type TextProps } from "react-native";

import { useLanguage } from "./LanguageProvider";

export interface AITextProps extends TextProps {
  children: string;
  context?: string;
}

/**
 * Presentation-only text boundary. The source string is UI content;
 * application code and behavior remain untouched. English renders
 * immediately, while other languages are localized by ReDom's backend.
 */
export function AIText({ children, context, ...props }: AITextProps) {
  const { language, localizeText } = useLanguage();
  const [value, setValue] = useState(children);

  useEffect(() => {
    let active = true;
    setValue(children);

    if (language === "en") return () => {
      active = false;
    };

    void localizeText(children, context)
      .then((translated) => {
        if (active) setValue(translated);
      })
      .catch(() => {
        if (active) setValue(children);
      });

    return () => {
      active = false;
    };
  }, [children, context, language, localizeText]);

  return <Text {...props}>{value}</Text>;
}
