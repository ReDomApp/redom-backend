export interface AurelinkOptions { apiKey:string; baseUrl?:string; fetch?:typeof fetch; timeoutMs?:number; }
export interface RequestOptions { query?:Record<string,string|number|boolean|null|undefined>; body?:unknown; headers?:Record<string,string>; idempotencyKey?:string; timeoutMs?:number; }
export class AurelinkError extends Error { status:number; code:string; requestId:string|null; retryAfter:string|null; rateLimitLimit:string|null; rateLimitRemaining:string|null; details:unknown; }
export class Aurelink {
 constructor(options:AurelinkOptions);
 request<T=unknown>(method:string,path:string,options?:RequestOptions):Promise<T>;
 services:{list(query?:RequestOptions["query"]):Promise<any>};
 countries:{list(query?:RequestOptions["query"]):Promise<any>};
 orders:{list(query?:RequestOptions["query"]):Promise<any>};
 wallet:{retrieve():Promise<any>;ledger(query?:RequestOptions["query"]):Promise<any>};
 communications:{
   overview():Promise<any>;
   sms:{send(body:{recipient:string;sender:string;content:string;category?:"transactional"|"marketing"|"otp"|"notification";provider?:"brevo"|"twilio";},options?:RequestOptions):Promise<any>};
   email:{send(body:{recipient:string;sender:string;senderName?:string;subject:string;html?:string;text?:string;replyTo?:string;provider?:"resend"|"brevo";},options?:RequestOptions):Promise<any>};
 };
 verify:{start(body:{destination:string;channel?:"sms"|"email";purpose?:string;sender?:string;provider?:"brevo"|"twilio"|"resend";},options?:RequestOptions):Promise<any>;check(id:string,code:string):Promise<any>};
 activations:{quote(body:unknown):Promise<any>;create(body:unknown,options?:RequestOptions):Promise<any>;retrieve(id:string):Promise<any>;messages(id:string):Promise<any>;resend(id:string,body?:unknown):Promise<any>;cancel(id:string,body?:unknown):Promise<any>};
 rentals:{list(query?:RequestOptions["query"]):Promise<any>;services(rentalId:string,query?:RequestOptions["query"]):Promise<any>;pricing(rentalId:string,query?:RequestOptions["query"]):Promise<any>;quote(body:unknown):Promise<any>;create(body:unknown,options?:RequestOptions):Promise<any>;retrieve(id:string):Promise<any>;messages(id:string):Promise<any>;renew(id:string,body?:unknown,options?:RequestOptions):Promise<any>;cancel(id:string,body?:unknown):Promise<any>};
 nonVoip:{countries():Promise<any>;products(query?:RequestOptions["query"]):Promise<any>;create(body:unknown,options?:RequestOptions):Promise<any>;messages(id:string):Promise<any>;cancel(id:string,body?:unknown):Promise<any>};
 dedicated:{countries():Promise<any>;quote(body:unknown):Promise<any>;create(body:unknown,options?:RequestOptions):Promise<any>;messages(id:string):Promise<any>;setAutoRenew(id:string,enabled:boolean):Promise<any>;cancel(id:string,body?:unknown):Promise<any>};
}
export function verifyAurelinkWebhook(input:{payload:string|Buffer;signature:string;timestamp:string|number;secret:string;toleranceSeconds?:number}):boolean;
