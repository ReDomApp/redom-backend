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
   analytics(query?:RequestOptions["query"]):Promise<any>;
   domains:{list():Promise<any>;create(body:{domain:string;provider?:"resend"|"brevo"}):Promise<any>;check(id:string):Promise<any>;verify(id:string):Promise<any>;tracking(id:string,body:{openTracking?:boolean;clickTracking?:boolean}):Promise<any>;applyDns(id:string):Promise<any>;connectCloudflare(body:{domain:string;zoneId:string;apiToken:string}):Promise<any>;cloudflareConnections():Promise<any>};
   emailSenders:{list():Promise<any>;create(body:{email:string;name:string;provider?:"resend"|"brevo"}):Promise<any>;check(id:string):Promise<any>};
   senders:{list():Promise<any>;request(body:{sender:string;provider:"twilio"|"brevo";countryCode:string;businessName:string;businessWebsite:string;messageUseCase:string;sampleMessage:string;senderType?:"alphanumeric";estimatedMonthlyVolume?:string;registrationDocuments?:string[]}):Promise<any>};
   smtp:{credentials:{list():Promise<any>;create(body?:{label?:string}):Promise<any>;revoke(id:string):Promise<any>}};
   templates:{list(query?:RequestOptions["query"]):Promise<any>;create(body:{channel:"sms"|"email";name:string;subject?:string;text?:string;html?:string;variables?:string[]}):Promise<any>;update(id:string,body:{name?:string;subject?:string;text?:string;html?:string;status?:"draft"|"active"|"archived"}):Promise<any>;archive(id:string):Promise<any>};
   messages:{list(query?:RequestOptions["query"]):Promise<any>;retrieve(id:string):Promise<any>;retry(id:string,options?:RequestOptions):Promise<any>};
   contacts:{list(query?:RequestOptions["query"]):Promise<any>;upsert(body:{channel:"sms"|"email";address:string;displayName?:string;consentStatus?:"unknown"|"opted_in"|"opted_out";consentSource?:string}):Promise<any>};
   sms:{send(body:{recipient:string;sender:string;countryCode:string;content:string;category?:"transactional"|"marketing"|"otp"|"notification";},options?:RequestOptions):Promise<any>};
   email:{send(body:{recipient:string;sender:string;senderName?:string;subject?:string;html?:string;text?:string;replyTo?:string;templateId?:string;variables?:Record<string,string|number|boolean>;attachments?:Array<{filename:string;content:string;contentType?:string}>;scheduledAt?:string;},options?:RequestOptions):Promise<any>};
   campaigns:{list():Promise<any>;create(body:{channel:"sms"|"email";name:string;subject?:string;text?:string;html?:string;content?:string}):Promise<any>;send(id:string,body:{sender:string;countryCode?:string;senderName?:string;webUrl?:string}):Promise<any>};
 };
 verify:{start(body:{destination:string;channel?:"sms"|"email";purpose?:string;sender?:string;countryCode?:string;},options?:RequestOptions):Promise<any>;check(id:string,code:string):Promise<any>};
 activations:{quote(body:unknown):Promise<any>;create(body:unknown,options?:RequestOptions):Promise<any>;retrieve(id:string):Promise<any>;messages(id:string):Promise<any>;resend(id:string,body?:unknown):Promise<any>;cancel(id:string,body?:unknown):Promise<any>};
 rentals:{list(query?:RequestOptions["query"]):Promise<any>;services(rentalId:string,query?:RequestOptions["query"]):Promise<any>;pricing(rentalId:string,query?:RequestOptions["query"]):Promise<any>;quote(body:unknown):Promise<any>;create(body:unknown,options?:RequestOptions):Promise<any>;retrieve(id:string):Promise<any>;messages(id:string):Promise<any>;renew(id:string,body?:unknown,options?:RequestOptions):Promise<any>;cancel(id:string,body?:unknown):Promise<any>};
 nonVoip:{countries():Promise<any>;products(query?:RequestOptions["query"]):Promise<any>;create(body:unknown,options?:RequestOptions):Promise<any>;messages(id:string):Promise<any>;cancel(id:string,body?:unknown):Promise<any>};
 dedicated:{countries():Promise<any>;quote(body:unknown):Promise<any>;create(body:unknown,options?:RequestOptions):Promise<any>;messages(id:string):Promise<any>;setAutoRenew(id:string,enabled:boolean):Promise<any>;cancel(id:string,body?:unknown):Promise<any>};
}
export function verifyAurelinkWebhook(input:{payload:string|Buffer;signature:string;timestamp:string|number;secret:string;toleranceSeconds?:number}):boolean;
