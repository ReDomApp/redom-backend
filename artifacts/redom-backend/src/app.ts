import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import profileShareRouter from "./routes/profile-share.routes";
import { logger } from "./lib/logger";
import { apiRateLimit } from "./middleware/rate-limit.middleware";
const app:Express=express();app.set("trust proxy",1);app.use(pinoHttp({logger,serializers:{req(req){return{id:req.id,method:req.method,url:req.url?.split("?")[0]}},res(res){return{statusCode:res.statusCode}}}}));app.use(cors());app.use(express.json({limit:"12mb"}));app.use(express.urlencoded({extended:true,limit:"12mb"}));app.use(profileShareRouter);app.use("/redom-backend",apiRateLimit,router);app.use("/",apiRateLimit,router);app.use("/redom-backend",(_req,res)=>{res.status(404).json({success:false,message:"Route not found."})});app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{logger.error({error},"Unhandled API error");if(res.headersSent)return;res.status(500).json({success:false,message:"Internal server error."})});export default app;
