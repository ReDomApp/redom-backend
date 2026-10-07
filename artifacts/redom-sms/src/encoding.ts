const GSM7_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

export function isGsm7(text:string):boolean {
  for (const ch of text) {
    if (!GSM7_BASIC.includes(ch) && !GSM7_EXT.includes(ch)) return false;
  }
  return true;
}

export function encodingFor(text:string):"GSM7"|"UCS2" {
  return isGsm7(text) ? "GSM7" : "UCS2";
}

export function segmentCount(text:string):number {
  const enc=encodingFor(text);
  if(enc==="GSM7") {
    const units=[...text].reduce((n,c)=>n+(GSM7_EXT.includes(c)?2:1),0);
    return units<=160?1:Math.ceil(units/153);
  }
  return [...text].length<=70?1:Math.ceil([...text].length/67);
}

export function encodeSegment(text:string, encoding:"GSM7"|"UCS2"):Buffer {
  if(encoding==="UCS2") return Buffer.from(text,"utf16le");
  const bytes:number[]=[];
  for(const ch of text){
    const idx=GSM7_BASIC.indexOf(ch);
    if(idx>=0){bytes.push(idx);continue;}
    const ext=GSM7_EXT.indexOf(ch);
    if(ext>=0){bytes.push(0x1b, ext);continue;}
    throw new Error("Text contains a character not representable in GSM-7");
  }
  return Buffer.from(bytes);
}
