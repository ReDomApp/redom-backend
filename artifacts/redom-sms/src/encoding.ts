const BASIC="@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const EXT=new Set(["^","{","}","\\","[","~","]","|","€"]);
const EXT_CODES=[10,40,41,47,60,61,62,64,101];

export function isGsm7(text:string):boolean{return [...text].every(c=>BASIC.includes(c)||EXT.has(c));}
export function encodingFor(text:string):"GSM7"|"UCS2"{return isGsm7(text)?"GSM7":"UCS2";}
export function gsm7Units(text:string):number{return [...text].reduce((n,c)=>n+(EXT.has(c)?2:1),0);}
export function segmentCount(text:string):number{if(encodingFor(text)==="GSM7"){const u=gsm7Units(text);return u<=160?1:Math.ceil(u/153)}const u=[...text].length;return u<=70?1:Math.ceil(u/67);}
function septets(text:string):number[]{const out:number[]=[];for(const c of text){const i=BASIC.indexOf(c);if(i>=0){out.push(i);continue}const e=[...EXT].indexOf(c);if(e>=0)out.push(0x1b,EXT_CODES[e]);else throw new Error("Text contains a character not representable in GSM-7")}return out;}
export function encodeSegment(text:string,encoding:"GSM7"|"UCS2"):Buffer{
  if(encoding==="UCS2"){const out=Buffer.alloc([...text].length*2);let o=0;for(const c of text){const cp=c.codePointAt(0)!;if(cp>0xffff)throw new Error("Supplementary Unicode characters require UCS-2 surrogate handling");out.writeUInt16BE(cp,o);o+=2;}return out;}
  const s=septets(text),out=Buffer.alloc(Math.ceil(s.length*7/8));for(let i=0;i<s.length;i++){const bit=i*7,byte=Math.floor(bit/8),shift=bit%8,v=s[i]<<shift;out[byte]|=v&255;if(shift>1&&byte+1<out.length)out[byte+1]|=(v>>8)&255;}return out;
}
export function encodeMultipartPart(text:string,encoding:"GSM7"|"UCS2",ref:number,total:number,index:number):Buffer{
  const udh=Buffer.from([5,0,3,ref&255,total&255,index&255]),body=encodeSegment(text,encoding);
  if(encoding==="UCS2")return Buffer.concat([udh,body]);
  const s=septets(text),bitOffset=udh.length*8,out=Buffer.alloc(udh.length+Math.ceil((bitOffset+s.length*7)/8));udh.copy(out);
  for(let i=0;i<s.length;i++){const bit=bitOffset+i*7,byte=Math.floor(bit/8),shift=bit%8,v=s[i]<<shift;out[byte]|=v&255;if(shift>1&&byte+1<out.length)out[byte+1]|=(v>>8)&255;}return out;
}