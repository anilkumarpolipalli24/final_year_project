"use strict";
const router = require("express").Router();
const ctrl   = require("./controllers/blockchainController_v2");
const auth   = require("./middleware/authenticate");
const authz  = require("./middleware/authorize");

router.get("/stats",          auth, ctrl.dashboardStats);
router.get("/chain",          auth, authz(["SUPER_ADMIN","ADMIN","HOD","FACULTY"]), ctrl.getChain);
router.get("/validate",       auth, authz(["SUPER_ADMIN","ADMIN","HOD"]),           ctrl.validateChain);
router.get("/tamper-alerts",  auth, authz(["SUPER_ADMIN","ADMIN"]),                 ctrl.tamperAlerts);
router.get("/audit-logs",     auth, authz(["SUPER_ADMIN","ADMIN","HOD"]),           ctrl.auditLogs);
router.get("/verifications",  auth, authz(["SUPER_ADMIN","ADMIN","HOD","FACULTY"]), ctrl.verifications);
router.get("/block/:index",   auth, ctrl.getBlock);

module.exports = router;