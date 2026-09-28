import axios from "axios";
import { env } from "../../config/env";
import { pool } from "../../database/db";

type CountrySpec={id:string;default_currency?:string|null;supported_payment_currencies?:string[];supported_payment_methods?:string[]};
type StripeCountry={name:string;isoCode:string;currency:string;rate:number;cardSupported:boolean;successRate:number|null;observedPayments:number};

const STRIPE_API="https://api.stripe.com/v1";
const FX_API="https://open.er-api.com/v6/latest/USD";
let cached:StripeCountry[]|null=null;
let cachedAt=0;
let fxRates:Record<string,number>={USD:1};
let fxFetchedAt=0;
const CACHE_MS=6*60*60*1000;
const FX_CACHE_MS=60*60*1000;

function headers(){return {Authorization:"Bearer "+env.stripe.secretKey};}
async function listCountrySpecs():Promise<CountrySpec[]>{
 const all:CountrySpec[]=[];
 let startingAfter:string|undefined;
 for(let page=0;page<10;page++){
  const params=new URLSearchParams({limit:"100"});if(startingAfter)params.set("starting_after",startingAfter);
  const r=await axios.get<{data:CountrySpec[];has_more:boolean}>(STRIPE_API+"/country_specs",{headers:headers(),params,timeout:20000});
  all.push(...(r.data?.data??[]));
  if(!r.data?.has_more||!r.data.data?.length)break;
  startingAfter=r.data.data[r.data.data.length-1].id;
 }
 return all;
}
async function loadFx(){
 if(Date.now()-fxFetchedAt<FX_CACHE_MS)return;
 try{
  const r=await axios.get<{result:string;rates:Record<string,number>}>(FX_API,{timeout:10000});
  if(r.data?.result==="success"&&r.data.rates){fxRates={USD:1,...r.data.rates};fxFetchedAt=Date.now();}
 }catch{}
}
async function observedSuccessRates(){
 const r=await pool.query(`
  SELECT country_code,
    COUNT(*) FILTER (WHERE status IN ('paid','completed'))::int AS successful,
    COUNT(*) FILTER (WHERE status IN ('paid','completed','failed'))::int AS observed
  FROM payment_transactions
  WHERE payment_provider='stripe' AND country_code IS NOT NULL
    AND created_at >= now()-interval '90 days'
  GROUP BY country_code
 `);
 return new Map<string,{rate:number|null;observed:number}>(
  r.rows.map((x:any)=>[String(x.country_code).toUpperCase(),{
    rate:Number(x.observed)>0?Number(((Number(x.successful)/Number(x.observed))*100).toFixed(2)):null,
    observed:Number(x.observed)
  }])
 );
}
export async function getStripeStarsCountries():Promise<StripeCountry[]>{
 if(cached&&Date.now()-cachedAt<CACHE_MS)return cached;
 await loadFx();
 const [specs,success]=await Promise.all([listCountrySpecs(),observedSuccessRates()]);
 const display=new Intl.DisplayNames(["en"],{type:"region"});
 const countries:StripeCountry[]=[];
 for(const spec of specs){
  const iso=String(spec.id).toUpperCase();
  const methods=new Set((spec.supported_payment_methods??[]).map(x=>String(x).toLowerCase()));
  if(!methods.has("card"))continue;
  const currency=String(spec.default_currency??"").toUpperCase();
  if(!currency)continue;
  const rate=Number(fxRates[currency]);
  const observed=success.get(iso);
  countries.push({
   name:display.of(iso)||iso,
   isoCode:iso,
   currency,
   rate:Number.isFinite(rate)&&rate>0?rate:0,
   cardSupported:true,
   successRate:observed?.rate??null,
   observedPayments:observed?.observed??0,
  });
 }
 cached=countries.sort((a,b)=>a.name.localeCompare(b.name));
 cachedAt=Date.now();
 return cached;
}
export async function getStripeStarsCountry(code:string){
 const countries=await getStripeStarsCountries();
 return countries.find(x=>x.isoCode===String(code).toUpperCase())??null;
}
export function stripeMinimumMinor(currency:string):number|null{
 const m:Record<string,number>={
  USD:50,AED:200,ARS:50,AUD:50,BRL:50,CAD:50,CHF:50,COP:50,CZK:1500,DKK:250,
  EUR:50,GBP:30,HKD:400,HUF:17500,IDR:50,ILS:50,INR:50,JPY:50,KRW:50,MXN:1000,
  MYR:200,NOK:300,NZD:50,PHP:50,PLN:200,RON:200,RUB:50,SEK:300,SGD:50,THB:1000,ZAR:50
 };
 return m[String(currency).toUpperCase()]??null;
}
export function clearStripeStarsCountryCache(){cached=null;cachedAt=0;fxFetchedAt=0;}
