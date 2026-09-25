import { Router, type IRouter, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import crmRouter from "./crm";
import crmWorkspaceRouter from "./crm-workspaces";
import healthRouter from "./health";
import { requireCrmWorkspaceContext } from "../lib/crm-workspaces";

const router: IRouter = Router();

router.use(healthRouter);
const requireAuth: RequestHandler = (req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

router.use("/crm", requireAuth);
router.use(crmWorkspaceRouter);
router.use("/crm", requireCrmWorkspaceContext);
router.use(crmRouter);

export default router;
