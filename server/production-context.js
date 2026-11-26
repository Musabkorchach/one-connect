export function productionSettings(env) {
  if (env.ONECONNECT_DEPLOYMENT !== "production") return null;
  const { ONECONNECT_PRODUCTION_MONGODB_URI: mongoUri, ONECONNECT_PRODUCTION_ORIGIN: origin } = env;
  if (!mongoUri || mongoUri === env.MONGODB_URI) {
    throw new Error("Production requires a dedicated MongoDB connection.");
  }
  if (!origin || origin !== new URL(origin).origin || !origin.startsWith("https://")) {
    throw new Error("Production requires a dedicated HTTPS frontend origin.");
  }
  return { mongoUri, origin, database: "oneconnect_production" };
}

// The existing account-scoped handlers implement these features. Other legacy,
// external-provider and payment routes are unavailable in the Production process.
const accountRoutes = [
  ["GET", /^\/health$/],
  ["POST", /^\/api\/auth\/(verify|logout)$/],
  ["POST", /^\/api\/account\/deletion\/(challenge|confirm)$/],
  ["GET", /^\/api\/calls\/(ice-servers|history)$/],
  ["GET,PUT", /^\/api\/profile$/],
  ["GET,POST", /^\/api\/contacts$/],
  ["GET,PUT", /^\/api\/state\/connect\.(profile|contacts|invoice-drafts)$/],
  ["GET,POST", /^\/api\/chat\/conversations$/],
  ["GET", /^\/api\/chat\/conversations\/[a-f\d]{64}$/i],
  ["POST", /^\/api\/chat\/(attachments|images)$/],
  ["GET", /^\/api\/chat\/(attachments|images)\/[a-f\d]{24}$/i],
  ["DELETE", /^\/api\/chat\/messages\/[^/]+\/[^/]+$/],
  ["GET,POST", /^\/api\/groups$/],
  ["GET", /^\/api\/groups\/invitations$/],
  ["GET,POST", /^\/api\/groups\/[a-f\d]{24}\/messages$/i],
  ["POST", /^\/api\/groups\/[a-f\d]{24}\/(read|leave|invitations|media)$/i],
  ["POST", /^\/api\/groups\/[a-f\d]{24}\/invitations\/(accept|decline)$/i],
  ["DELETE", /^\/api\/groups\/[a-f\d]{24}\/(members|invitations)\/[^/]+$/i],
  ["POST", /^\/api\/groups\/[a-f\d]{24}\/ownership-offers(?:\/[a-f\d]{24}\/(accept|decline))?$/i],
  ["GET", /^\/api\/groups\/[a-f\d]{24}\/media\/[a-f\d]{24}$/i],
  ["GET", /^\/api\/emails$/],
  ["POST", /^\/api\/emails\/(internal|attachments)$/],
  ["GET", /^\/api\/emails\/[^/]+\/attachment$/],
  ["PATCH", /^\/api\/emails\/[^/]+\/read$/],
  ["DELETE", /^\/api\/emails\/[^/]+$/],
];

export function restrictProductionRoutes(req, res, next) {
  const method = req.method === "HEAD" ? "GET" : req.method;
  if (accountRoutes.some(([methods, route]) => methods.split(",").includes(method) && route.test(req.path))) {
    next();
  } else {
    res.sendStatus(404);
  }
}
