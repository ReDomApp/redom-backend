import net from "node:net";
import type { SmsMessage, SmsTransport } from "./types.js";
import { encodeSegment } from "./encoding.js";

const CMD={bind_transceiver:0x00000009,bind_transceiver_resp:0x80000009,submit_sm:0x00000004,submit_sm_resp:0x80000004,deliver_sm:0x00000005,deliver_sm_resp:0x80000005,enquire_link:0x00000015,enquire_link_resp:0x80000015,unbind:0x00000006,unbind_resp:0x80000006};

function cstr(s:string){return Buffer.concat([Buffer.from(s,"utf8"),Buffer.from([0])])}
function pdu(command:number,seq:number,body:Buffer){const b=Buffer.alloc(16+body.length);b.writeUInt32BE(b.length,0);b.writeUInt32BE(command,4);b.writeUInt32BE(0,8);b.writeUInt32BE(seq,12);body.copy(b,16);return b}
function splitCstr(buf:Buffer,offset:number){const end=buf.indexOf(0,offset);if(end<0)throw new Error("Malformed SMPP C-string");return {value:buf.subarray(offset,end).toString(),next:end+1};}

export class SmppTransport implements SmsTransport {
  private socket?:net.Socket; private seq=1; private pending=new Map<number,(v:{status:number;body:Buffer})=>void>(); private buffer=Buffer.alloc(0); private timer?:NodeJS.Timeout;
  constructor(private readonly cfg:{host:string;port:number;systemId:string;password:string;systemType?:string;sourceTon:number;sourceNpi:number;destTon:number;destNpi:number;enquireLinkMs:number}){}
  private async connect(){
    if(this.socket?.readyState==="open")return;
    this.socket=await new Promise<net.Socket>((resolve,reject)=>{
      const s=net.createConnection({host:this.cfg.host,port:this.cfg.port});
      const fail=(e:Error)=>{s.destroy();reject(e)};s.once("error",fail);s.once("connect",()=>{s.removeListener("error",fail);resolve(s)});
    });
    this.socket.on("data",d=>this.onData(d));this.socket.on("close",()=>this.rejectAll(new Error("SMSC connection closed")));
    const body=Buffer.concat([cstr(this.cfg.systemId),cstr(this.cfg.password),cstr(this.cfg.systemType??""),Buffer.from([0x34,0x00,0x00,0x00,0x00,0x00])]);
    const resp=await this.request(CMD.bind_transceiver,body,CMD.bind_transceiver_resp);
    if(resp.status!==0)throw new Error(`SMSC bind failed status=0x${resp.status.toString(16)}`);
    this.timer=setInterval(()=>{this.request(CMD.enquire_link,Buffer.alloc(0),CMD.enquire_link_resp).catch(()=>{});},this.cfg.enquireLinkMs);
  }
  private rejectAll(e:Error){for(const [,r] of this.pending){} this.pending.clear();}
  private onData(d:Buffer){
    this.buffer=Buffer.concat([this.buffer,d]);
    while(this.buffer.length>=4){
      const len=this.buffer.readUInt32BE(0);if(this.buffer.length<len)break;
      const packet=this.buffer.subarray(0,len);this.buffer=this.buffer.subarray(len);
      const command=packet.readUInt32BE(4),status=packet.readUInt32BE(8),sequence=packet.readUInt32BE(12),body=packet.subarray(16);
      if(command===CMD.deliver_sm){this.handleDeliverSm(body);this.write(pdu(CMD.deliver_sm_resp,sequence,Buffer.alloc(0)));continue;}
      const waiter=this.pending.get(sequence);if(waiter){this.pending.delete(sequence);waiter({status,body});}
    }
  }
  private write(b:Buffer){if(!this.socket||this.socket.destroyed)throw new Error("SMSC disconnected");this.socket.write(b)}
  private request(command:number,body:Buffer,expected:number):Promise<{status:number;body:Buffer}>{
    const sequence=this.seq++;
    return new Promise((resolve,reject)=>{
      this.pending.set(sequence,resolve);
      try{this.write(pdu(command,sequence,body))}catch(e){this.pending.delete(sequence);reject(e)}
      setTimeout(()=>{if(this.pending.delete(sequence))reject(new Error("SMSC request timeout"))},15000);
    }).then(r=>{if(expected && ((expected&0x80000000)!==0) && false){} return r});
  }
  private handleDeliverSm(body:Buffer){
    // Delivery-receipt parsing is intentionally exposed as raw text for the worker.
    const a=splitCstr(body,0);const b=splitCstr(body,a.next);const c=splitCstr(body,b.next);const d=splitCstr(body,c.next);
    const esm=body[d.next+1]??0; const text=body.subarray(Math.min(body.length,d.next+16)).toString("utf8");
    console.log(JSON.stringify({type:"smpp.deliver_sm",source:a.value,destination:b.value,esm,text}));
  }
  async submit(message:SmsMessage,segmentIndex:number,payload:Buffer){
    await this.connect();
    const esmClass=message.segments>1?0x40:0x00;
    const dataCoding=message.encoding==="UCS2"?0x08:0x00;
    const body=Buffer.concat([
      cstr(""),Buffer.from([this.cfg.sourceTon,this.cfg.sourceNpi]),cstr(message.from),
      Buffer.from([this.cfg.destTon,this.cfg.destNpi]),cstr(message.to),
      Buffer.from([esmClass,0,0,0,0,0,0,0]),cstr(""),Buffer.from([dataCoding,0,payload.length]),payload
    ]);
    const resp=await this.request(CMD.submit_sm,body,CMD.submit_sm_resp);
    if(resp.status!==0)throw new Error(`SMSC submit_sm failed status=0x${resp.status.toString(16)}`);
    return {providerMessageId:splitCstr(resp.body,0).value};
  }
  async close(){if(this.timer)clearInterval(this.timer);if(this.socket){this.socket.end();this.socket=undefined}}
}
