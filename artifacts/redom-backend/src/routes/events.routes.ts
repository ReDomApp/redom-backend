import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { pool } from "../database/db";
import { env } from "../config/env";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";

const router = Router();
const r2 = new S3Client({ region: env.cloudflare.r2.region || "auto", endpoint: env.cloudflare.r2.endpoint, credentials: { accessKeyId: env.cloudflare.r2.accessKeyId, secretAccessKey: env.cloudflare.r2.secretAccessKey } });

function parseImage(value: string) {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("Only JPEG, PNG, WebP and GIF event images are supported.");
  const body = Buffer.from(match[2], "base64");
  if (!body.length || body.length > 8 * 1024 * 1024) throw new Error("Event images must be 8 MB or smaller.");
  return { mime: match[1] === "image/jpg" ? "image/jpeg" : match[1], body };
}
async function publicEvent(id: string, viewer: string | null) {
  const r = await pool.query(`SELECT e.*, u.first_name AS creator_first_name, u.last_name AS creator_last_name,
    (SELECT COUNT(*)::int FROM event_responses er WHERE er.event_id=e.id AND er.status='interested') AS interested_count,
    (SELECT COUNT(*)::int FROM event_responses er WHERE er.event_id=e.id AND er.status='going') AS going_count,
    (SELECT er.status FROM event_responses er WHERE er.event_id=e.id AND er.user_id=$2 LIMIT 1) AS viewer_status
    FROM events e JOIN users u ON u.id=e.creator_user_id
    WHERE e.id=$1 AND e.status='active' LIMIT 1`, [id, viewer]);
  const e=r.rows[0]; if(!e)return null;
  if(e.privacy==="public" || e.creator_user_id===viewer)return e;
  if(e.privacy==="friends" && viewer){
    const f=await pool.query(`SELECT 1 FROM friends WHERE ((user_id=$1 AND friend_user_id=$2) OR (user_id=$2 AND friend_user_id=$1)) AND friendship_status='active' LIMIT 1`,[viewer,e.creator_user_id]);
    if(f.rowCount)return e;
  }
  return null;
}

router.get("/media/:id", authMiddleware, async (req,res)=>{
  try{
    const event=await publicEvent(String(req.params.id), req.user?.userId ?? null); if(!event?.cover_key)return res.status(404).end();
    const object=await r2.send(new GetObjectCommand({Bucket:env.cloudflare.r2.bucketName,Key:event.cover_key}));
    if(!object.Body)return res.status(404).end();
    res.setHeader("Cache-Control","public,max-age=600");res.setHeader("Content-Type",object.ContentType||"image/jpeg");
    return res.end(Buffer.from(await object.Body.transformToByteArray()));
  }catch{return res.status(404).end();}
});

router.use(authMiddleware, authRateLimit);

const eventInput=z.object({
  name:z.string().trim().min(1).max(200),
  description:z.string().trim().max(10000).optional().default(""),
  startAt:z.string().datetime(),
  endAt:z.string().datetime().nullable().optional(),
  timezone:z.string().min(1).max(80),
  eventType:z.enum(["in_person","virtual"]),
  privacy:z.enum(["public","friends","private"]),
  locationName:z.string().trim().max(255).optional().default(""),
  locationCity:z.string().trim().max(160).optional().default(""),
  locationLat:z.number().finite().nullable().optional(),
  locationLng:z.number().finite().nullable().optional(),
  locationRadiusMiles:z.number().int().min(1).max(250).nullable().optional(),
  locationMode:z.enum(["suggested","custom"]).default("suggested"),
  virtualUrl:z.string().url().max(2000).nullable().optional(),
  repeatRule:z.enum(["none","daily","weekly","monthly","yearly"]).default("none"),
}).superRefine((v,ctx)=>{
  const start=new Date(v.startAt), end=v.endAt?new Date(v.endAt):null;
  if(Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime())))ctx.addIssue({code:"custom",path:["startAt"],message:"Invalid event date."});
  if(end && end<=start)ctx.addIssue({code:"custom",path:["endAt"],message:"End time must be after the start time."});
  if(v.eventType==="in_person" && !v.locationName && !v.locationCity)ctx.addIssue({code:"custom",path:["locationName"],message:"Add a location for an in-person event."});
  if(v.eventType==="virtual" && !v.virtualUrl)ctx.addIssue({code:"custom",path:["virtualUrl"],message:"Add the virtual event link."});
});

router.get("/",async(req,res)=>{
  const me=req.user!.userId, mode=String(req.query.mode??"for_you"), city=String(req.query.city??"").trim(), q=String(req.query.q??"").trim();
  const lat=Number(req.query.lat),lng=Number(req.query.lng),radius=Math.min(250,Math.max(1,Number(req.query.radius??50)));
  const where=["e.status='active'","e.start_at>=now()","(e.privacy='public' OR e.creator_user_id=$1 OR (e.privacy='friends' AND EXISTS(SELECT 1 FROM friends f WHERE ((f.user_id=$1 AND f.friend_user_id=e.creator_user_id) OR (f.user_id=e.creator_user_id AND f.friend_user_id=$1)) AND f.friendship_status='active'))"];
  const params:any[]=[me]; let n=2;
  if(q){where.push(`(e.name ILIKE $${n} OR COALESCE(e.location_name,'') ILIKE $${n} OR COALESCE(e.location_city,'') ILIKE $${n})`);params.push("%"+q+"%");n++;}
  if(city){where.push(`COALESCE(e.location_city,'') ILIKE $${n}`);params.push("%"+city+"%");n++;}
  if(mode==="local" && Number.isFinite(lat) && Number.isFinite(lng)){where.push(`e.location_lat IS NOT NULL AND e.location_lng IS NOT NULL AND (3959 * acos(least(1,greatest(-1,cos(radians($${n}))*cos(radians(e.location_lat))*cos(radians(e.location_lng)-radians($${n+1}))+sin(radians($${n}))*sin(radians(e.location_lat)))))) <= $${n+2}`);params.push(lat,lng,radius);n+=3;}
  const r=await pool.query(`SELECT e.*,u.first_name AS creator_first_name,u.last_name AS creator_last_name,
    (SELECT COUNT(*)::int FROM event_responses er WHERE er.event_id=e.id AND er.status='interested') interested_count,
    (SELECT COUNT(*)::int FROM event_responses er WHERE er.event_id=e.id AND er.status='going') going_count,
    (SELECT er.status FROM event_responses er WHERE er.event_id=e.id AND er.user_id=$1 LIMIT 1) viewer_status
    FROM events e JOIN users u ON u.id=e.creator_user_id WHERE ${where.join(" AND ")} ORDER BY e.start_at ASC LIMIT 50`,params);
  res.json({success:true,events:r.rows});
});

router.get("/mine",async(req,res)=>{
  const tab=String(req.query.tab??"hosting");
  const r=await pool.query(`SELECT e.*,(SELECT COUNT(*)::int FROM event_responses er WHERE er.event_id=e.id AND er.status='interested') interested_count,(SELECT COUNT(*)::int FROM event_responses er WHERE er.event_id=e.id AND er.status='going') going_count FROM events e WHERE e.creator_user_id=$1 AND e.status='active' ${tab==="past"?"AND e.start_at<now()":"AND e.start_at>=now()"} ORDER BY e.start_at DESC LIMIT 100`,[req.user!.userId]);
  res.json({success:true,events:r.rows});
});

router.get("/settings",async(req,res)=>{
  const r=await pool.query("SELECT add_events_to_calendar FROM event_settings WHERE user_id=$1",[req.user!.userId]);
  res.json({success:true,settings:{addEventsToCalendar:r.rows[0]?.add_events_to_calendar??false}});
});
router.patch("/settings",async(req,res)=>{
  const parsed=z.object({addEventsToCalendar:z.boolean()}).safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Invalid event setting."});
  const r=await pool.query(`INSERT INTO event_settings(user_id,add_events_to_calendar) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET add_events_to_calendar=EXCLUDED.add_events_to_calendar,updated_at=now() RETURNING add_events_to_calendar`,[req.user!.userId,parsed.data.addEventsToCalendar]);
  res.json({success:true,settings:{addEventsToCalendar:r.rows[0].add_events_to_calendar}});
});

router.post("/",async(req,res)=>{
  const parsed=eventInput.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:parsed.error.issues[0]?.message||"Invalid event."});
  const v=parsed.data;
  const r=await pool.query(`INSERT INTO events(creator_user_id,name,description,start_at,end_at,timezone,event_type,privacy,location_name,location_city,location_lat,location_lng,location_radius_miles,location_mode,virtual_url,repeat_rule) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,[req.user!.userId,v.name,v.description||null,v.startAt,v.endAt||null,v.timezone,v.eventType,v.privacy,v.locationName||null,v.locationCity||null,v.locationLat??null,v.locationLng??null,v.locationRadiusMiles??null,v.locationMode,v.virtualUrl??null,v.repeatRule]);
  res.status(201).json({success:true,eventId:r.rows[0].id});
});

router.post("/:id/cover",async(req,res)=>{
  try{
    const image=typeof req.body?.image==="string"?req.body.image:"";if(!image)return res.status(400).json({success:false,message:"Image is required."});
    const owner=await pool.query("SELECT id FROM events WHERE id=$1 AND creator_user_id=$2 AND status='active' LIMIT 1",[req.params.id,req.user!.userId]);if(!owner.rowCount)return res.status(404).json({success:false,message:"Event not found."});
    const parsed=parseImage(image),ext=parsed.mime==="image/png"?"png":parsed.mime==="image/webp"?"webp":"jpg",key=`events/${req.user!.userId}/${req.params.id}/${Date.now()}-${randomUUID()}.${ext}`;
    await r2.send(new PutObjectCommand({Bucket:env.cloudflare.r2.bucketName,Key:key,Body:parsed.body,ContentType:parsed.mime}));
    await pool.query("UPDATE events SET cover_key=$1,updated_at=now() WHERE id=$2",[key,req.params.id]);
    res.json({success:true,mediaUrl:`/events/media/${req.params.id}`});
  }catch(e){res.status(400).json({success:false,message:e instanceof Error?e.message:"Unable to upload event image."});}
});

router.post("/:id/rsvp",async(req,res)=>{
  const parsed=z.object({status:z.enum(["interested","going"])}).safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Choose Interested or Going."});
  const event=await publicEvent(req.params.id,req.user!.userId);if(!event)return res.status(404).json({success:false,message:"Event not found."});
  await pool.query(`INSERT INTO event_responses(event_id,user_id,status) VALUES($1,$2,$3) ON CONFLICT(event_id,user_id) DO UPDATE SET status=EXCLUDED.status,updated_at=now()`,[req.params.id,req.user!.userId,parsed.data.status]);
  res.json({success:true,status:parsed.data.status});
});
router.delete("/:id/rsvp",async(req,res)=>{
  await pool.query("DELETE FROM event_responses WHERE event_id=$1 AND user_id=$2",[req.params.id,req.user!.userId]);res.json({success:true});
});

router.post("/:id/cancel",async(req,res)=>{
  const r=await pool.query("UPDATE events SET status='cancelled',updated_at=now() WHERE id=$1 AND creator_user_id=$2 AND status='active' RETURNING id",[req.params.id,req.user!.userId]);
  if(!r.rowCount)return res.status(404).json({success:false,message:"Event not found or you are not the host."});
  res.json({success:true});
});

router.get("/:id",async(req,res)=>{
  const e=await publicEvent(req.params.id,req.user!.userId);if(!e)return res.status(404).json({success:false,message:"Event not found."});
  res.json({success:true,event:e});
});

export default router;