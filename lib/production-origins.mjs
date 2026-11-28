export const productionHostingOrigin = "https://oneconnect-production-ui.onrender.com";
export const productionPiNetOrigin = "https://oneconnect5891.pinet.com";
export const productionApiOrigin = "https://oneconnect-production-api.onrender.com";

export function isProductionFrontendOrigin(origin) {
  return origin === productionHostingOrigin || origin === productionPiNetOrigin;
}
