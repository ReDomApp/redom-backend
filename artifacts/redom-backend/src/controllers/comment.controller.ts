import { Request, Response } from "express";
import { z } from "zod";

import { commentService, COMMENT_REACTION_TYPES } from "../services/feed/comment.service";

const idSchema = z.string().uuid();

function userId(req: Request) {
  if (!req.user?.userId) throw new Error("Authentication required.");
  return req.user.userId;
}

function sendError(res: Response, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "Authentication required." ? 401 : message.includes("not found") ? 404 : 400;
  res.status(status).json({ success: false, message });
}

export const commentController = {
  async list(req: Request, res: Response) {
    try {
      const postId = idSchema.parse(req.params.postId);
      const limit = z.coerce.number().int().min(1).max(100).optional().parse(req.query.limit);
      const before = req.query.before ? z.string().datetime({ offset: true }).parse(req.query.before) : undefined;
      res.json({ success: true, ...(await commentService.list(userId(req), postId, limit, before)) });
    } catch (error) { sendError(res, error, "Unable to load comments."); }
  },

  async create(req: Request, res: Response) {
    try {
      const postId = idSchema.parse(req.params.postId);
      const body = z.object({ content: z.string().min(1).max(5000), parentCommentId: idSchema.nullable().optional() }).parse(req.body);
      const comment = await commentService.create(userId(req), postId, body.content, body.parentCommentId);
      res.status(201).json({ success: true, comment });
    } catch (error) { sendError(res, error, "Unable to create comment."); }
  },

  async react(req: Request, res: Response) {
    try {
      const commentId = idSchema.parse(req.params.commentId);
      const body = z.object({ reactionType: z.enum(COMMENT_REACTION_TYPES) }).parse(req.body);
      res.json({ success: true, ...(await commentService.react(userId(req), commentId, body.reactionType)) });
    } catch (error) { sendError(res, error, "Unable to update comment Like."); }
  },

  async pin(req: Request, res: Response) {
    try {
      const commentId = idSchema.parse(req.params.commentId);
      const body = z.object({ pinned: z.boolean() }).parse(req.body);
      res.json({ success: true, ...(await commentService.pin(userId(req), commentId, body.pinned)) });
    } catch (error) { sendError(res, error, "Unable to update comment pin."); }
  },

  async edit(req: Request, res: Response) {
    try {
      const commentId = idSchema.parse(req.params.commentId);
      const body = z.object({ content: z.string().min(1).max(5000) }).parse(req.body);
      res.json(await commentService.edit(userId(req), commentId, body.content));
    } catch (error) { sendError(res, error, "Unable to edit comment."); }
  },

  async remove(req: Request, res: Response) {
    try {
      const commentId = idSchema.parse(req.params.commentId);
      res.json(await commentService.remove(userId(req), commentId));
    } catch (error) { sendError(res, error, "Unable to delete comment."); }
  },

  async share(req: Request, res: Response) {
    try {
      const commentId = idSchema.parse(req.params.commentId);
      const body = z.object({ destination: z.string().min(1).max(30), externalPlatform: z.string().max(50).optional() }).parse(req.body);
      res.json({ success: true, ...(await commentService.share(userId(req), commentId, body.destination, body.externalPlatform)) });
    } catch (error) { sendError(res, error, "Unable to create comment share link."); }
  },
};
