export interface StarCountry { name:string; isoCode:string; currency:string; }
export interface StarPackage { key:string; stars:number; usdPrice:number; localAmount:number; localAmountFormatted:string; currency:string; }
export interface StarTransaction { id:string; type:string; stars:number; balanceAfter:number; packageKey:string|null; countryCode:string|null; currency:string|null; amountMinor:number|null; reference:string|null; createdAt:string; }
