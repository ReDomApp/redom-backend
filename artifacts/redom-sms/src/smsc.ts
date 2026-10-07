import net from "node:net";
import type { SmsMessage, SmsTransport, DeliveryReceipt, InboundSms } from "./types.js";

const C={BIND:0x00000009,BIND_RESP:0x80000009,SUBMIT:0x00000004,DELIVER:0x00000005,DELIVER_RESP:0x80000005,UNBIND:0x00000006,UNBIND_RESP:0x80000006,ENQUIRE:0x00000015,ENQUIRE_RESP:0x80000015};
const cstr=(s:string)=>Buffer.concat([Buffer.from(s,"ascii"),Buffer.from([0])]);
const pdu=(cmd:number,seq:number,body:Buffer,status=0)=>{const b=Buffer.alloc(16+body.length);b.writeUInt32BE(b.length);b.writeUInt32BE(cmd,4);b.writeUInt32BE(status,8);b.writeUInt32BE(seq,12);body.copy(b,16);return b};
const readC=(b:Buffer,o:number)=>{const e=b.indexOf(0,o);if(e<0)throw new Error("Malformed SMPP C-string");return{value:b.subarray(o,e).toString("utf8"),next:e+1}};

function statusName(s:string):DeliveryReceipt["status"] {
  const x=s.toUpperCase();
  if(x==="DELIVRD"||x==="DELIVERED")return "delivered";
  if(x==="EXPIRED")return "expired";
  if(x==="UNDELIV"||x==="REJECTD"||x==="FAILED")return "failed";
  return "unknown";
}

export class SmppTransport implements SmsTransport {
  private socket?:net.Socket;
  private seq=1;
  private pending=new Map<number,{resolve:(v:{status:number;body:Buffer})=>void;reject:(e:Error)=>void}>();
  private buffer=Buffer.alloc(0);
  private timer?:NodeJS.Timeout;
  private connecting?:Promise<void>;

  constructor(private cfg:{
    host:string;port:number;systemId:string;password:string;systemType?:string;
    sourceTon:number;sourceNpi:number;destTon:number;destNpi:number;enquireLinkMs:number;
    onDeliveryReceipt?:(r:DeliveryReceipt)=>Promise<void>;onInbound?:(r:InboundSms)=>Promise<void>
  }){}

  private async connect():Promise<void>{
    if(this.socket&&!this.socket.destroyed)return;
    if(this.connecting)return this.connecting;
    this.connecting=(async()=>{
      const s=await new Promise<net.Socket>((resolve,reject)=>{
        const sock=net.createConnection({host:this.cfg.host,port:this.cfg.port});
        const fail=(e:Error)=>{sock.destroy();reject(e)};
        sock.once("error",fail);
        sock.once("connect",()=>{sock.removeListener("error",fail);resolve(sock)});
      });
      this.socket=s;
      s.on("data",d=>this.onData(d));
      s.on("error",e=>this.rejectAll(e instanceof Error?e:new Error(String(e))));
      s.on("close",()=>{this.clearKeepalive();this.rejectAll(new Error("SMSC connection closed"));this.socket=undefined});
      const body=Buffer.concat([cstr(this.cfg.systemId),cstr(this.cfg.password),cstr(this.cfg.systemType??""),Buffer.from([0x34,0,0]),cstr("")]);
      const r=await this.request(C.BIND,body);
      if(r.status!==0)throw new Error(`SMSC bind failed status=0x${r.status.toString(16)}`);
      this.timer=setInterval(()=>void this.request(C.ENQUIRE,Buffer.alloc(0)).catch(()=>{}),this.cfg.enquireLinkMs);
    })();
    try{await this.connecting}finally{this.connecting=undefined}
  }

  private clearKeepalive(){if(this.timer)clearInterval(this.timer);this.timer=undefined}
  private rejectAll(e:Error){for(const p of this.pending.values())p.reject(e);this.pending.clear()}

  private onData(d:Buffer){
    this.buffer=Buffer.concat([this.buffer,d]);
    while(this.buffer.length>=4){
      const len=this.buffer.readUInt32BE(0);
      if(len<16||len>1024*1024)throw new Error("Invalid SMPP PDU length");
      if(this.buffer.length<len)break;
      const b=this.buffer.subarray(0,len);this.buffer=this.buffer.subarray(len);
      const cmd=b.readUInt32BE(4),status=b.readUInt32BE(8),seq=b.readUInt32BE(12),body=b.subarray(16);
      if(cmd===C.ENQUIRE_RESP)continue;
      if(cmd===C.DELIVER){void this.handleDeliver(b).catch(()=>{});this.write(pdu(C.DELIVER_RESP,seq,Buffer.alloc(0)));continue}
      if(cmd===C.UNBIND){this.write(pdu(C.UNBIND_RESP,seq,Buffer.alloc(0)));continue}
      const p=this.pending.get(seq);if(p){this.pending.delete(seq);p.resolve({status,body})}
    }
  }

  private write(b:Buffer){if(!this.socket||this.socket.destroyed)throw new Error("SMSC disconnected");this.socket.write(b)}

  private request(cmd:number,body:Buffer):Promise<{status:number;body:Buffer}>{
    const seq=this.seq++>>>0;
    return new Promise((resolve,reject)=>{
      this.pending.set(seq,{resolve,reject});
      try{this.write(pdu(cmd,seq,body))}catch(e){this.pending.delete(seq);reject(e as Error);return}
      const t=setTimeout(()=>{const p=this.pending.get(seq);if(p){this.pending.delete(seq);p.reject(new Error("SMPP request timeout"))}},15000);
      const p=this.pending.get(seq);
      if(p){const resolve0=p.resolve,reject0=p.reject;p.resolve=v=>{clearTimeout(t);resolve0(v)};p.reject=e=>{clearTimeout(t);reject0(e)}}
    });
  }

  private parseTlvs(b:Buffer,o:number):Map<number,Buffer>{
    const out=new Map<number,Buffer>();
    while(o+4<=b.length){const tag=b.readUInt16BE(o),len=b.readUInt16BE(o+2);o+=4;if(o+len>b.length)break;out.set(tag,b.subarray(o,o+len));o+=len}
    return out;
  }

  private decodePayload(data:Buffer,coding:number):string{
    if(coding===8)return data.toString("utf16be");
    return data.toString("utf8");
  }

  private async handleDeliver(pduBuffer:Buffer){
    const body=pduBuffer.subarray(16);
    let p=readC(body,0);const sourceTon=body[p.next];const sourceNpi=body[p.next+1];void sourceTon;void sourceNpi;
    p=readC(body,p.next+2);const source=p.value;
    const destTon=body[p.next];const destNpi=body[p.next+1];void destTon;void destNpi;
    p=readC(body,p.next+2);const destination=p.value;
    const esm=body[p.next];const coding=body[p.next+3];const smDefault=body[p.next+5];const smLen=body[p.next+6];void smDefault;
    const data=body.subarray(p.next+7,p.next+7+smLen);
    const tlvs=this.parseTlvs(body,p.next+7+smLen);
    const receiptText=this.decodePayload(data,coding);
    const idTlv=tlvs.get(0x001E)?.toString("ascii");
    const m=receiptText.match(/id[:=]\s*([^\s]+).*?stat[:=]\s*([A-Z]+)/i);
    if((esm&0x04)!==0 || m || idTlv){
      const providerMessageId=idTlv??m?.[1];
      if(providerMessageId&&this.cfg.onDeliveryReceipt){
        const stat=m?.[2]??"UNKNOWN";
        await this.cfg.onDeliveryReceipt({providerMessageId,status:statusName(stat),raw:receiptText});
      }
      return;
    }
    if(this.cfg.onInbound&&source&&destination&&receiptText){
      const sms:InboundSms={from:source,to:destination,text:receiptText};
      await this.cfg.onInbound(sms);
    }
  }

  async submit(message:SmsMessage,_segmentIndex:number,payload:Buffer){
    await this.connect();
    const esm=message.segments>1?0x40:0,coding=message.encoding==="UCS2"?8:0;
    const body=Buffer.concat([
      cstr(""),Buffer.from([this.cfg.sourceTon,this.cfg.sourceNpi]),cstr(message.from),
      Buffer.from([this.cfg.destTon,this.cfg.destNpi]),cstr(message.to),
      Buffer.from([esm,0,0]),cstr(""),cstr(""),Buffer.from([1,0,coding,payload.length]),payload
    ]);
    const r=await this.request(C.SUBMIT,body);
    if(r.status!==0)throw new Error(`SMSC submit_sm failed status=0x${r.status.toString(16)}`);
    return{providerMessageId:readC(r.body,0).value};
  }

  async close(){
    this.clearKeepalive();
    try{if(this.socket&&!this.socket.destroyed)this.write(pdu(C.UNBIND,this.seq++,Buffer.alloc(0)))}catch{}
    this.socket?.end();
    this.socket=undefined;
    this.rejectAll(new Error("SMPP transport closed"));
  }
}
