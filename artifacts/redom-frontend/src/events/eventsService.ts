import { api } from "../api/client";
import { env } from "../config/env";

export type ReDomEvent = {
  id:string; creator_user_id:string; name:string; description:string|null; start_at:string; end_at:string|null; timezone:string;
  event_type:"in_person"|"virtual"; privacy:"public"|"friends"|"private"; location_name:string|null; location_city:string|null;
  location_lat:number|null; location_lng:number|null; location_radius_miles:number|null; location_mode:"suggested"|"custom";
  virtual_url:string|null; repeat_rule:"none"|"daily"|"weekly"|"monthly"|"yearly"; cover_key:string|null; status:string;
  interested_count:number; going_count:number; viewer_status:"interested"|"going"|null;
};
export type CreateEventInput={name:string;description:string;startAt:string;endAt:string|null;timezone:string;eventType:"in_person"|"virtual";privacy:"public"|"friends"|"private";locationName:string;locationCity:string;locationLat:number|null;locationLng:number|null;locationRadiusMiles:number|null;locationMode:"suggested"|"custom";virtualUrl:string|null;repeatRule:"none"|"daily"|"weekly"|"monthly"|"yearly"};
export const eventsService={
 list(p:{mode:"for_you"|"local";city?:string;q?:string;lat?:number;lng?:number;radius?:number}){const x=new URLSearchParams({mode:p.mode});if(p.city)x.set("city",p.city);if(p.q)x.set("q",p.q);if(p.lat!=null)x.set("lat",String(p.lat));if(p.lng!=null)x.set("lng",String(p.lng));if(p.radius)x.set("radius",String(p.radius));return api.get<{success:boolean;events:ReDomEvent[]}>("/events?"+x.toString());},
 mine(tab:"hosting"|"past"){return api.get<{success:boolean;events:ReDomEvent[]}>("/events/mine?tab="+tab);},
 get(id:string){return api.get<{success:boolean;event:ReDomEvent}>("/events/"+id);},
 create(input:CreateEventInput){return api.post<{success:boolean;eventId:string}>("/events",input);},
 uploadCover(id:string,image:string){return api.post<{success:boolean;mediaUrl:string}>("/events/"+id+"/cover",{image});},
 respond(id:string,status:"interested"|"going"){return api.post<{success:boolean;status:string}>("/events/"+id+"/rsvp",{status});},
 removeResponse(id:string){return api.delete<{success:boolean}>("/events/"+id+"/rsvp");},
 cancel(id:string){return api.post<{success:boolean}>("/events/"+id+"/cancel",{});},
 getSettings(){return api.get<{success:boolean;settings:{addEventsToCalendar:boolean}}>("/events/settings");},
 updateSettings(value:boolean){return api.patch<{success:boolean;settings:{addEventsToCalendar:boolean}}>("/events/settings",{addEventsToCalendar:value});},
 mediaUrl(id:string){return env.apiBaseUrl+"/events/media/"+id;}
};