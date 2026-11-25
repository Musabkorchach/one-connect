import { fileURLToPath } from "node:url";

const metadataFile = fileURLToPath(new URL("../public/.well-known/pi.toml", import.meta.url));
const imageFile = fileURLToPath(new URL("../public/oneconnect-token.svg", import.meta.url));
const jpegFile = fileURLToPath(new URL("../public/oneconnect-token.jpg", import.meta.url));

export function registerTokenMetadataRoutes(app) {
  app.get("/.well-known/pi.toml", (_req, res) => {
    res.set("Content-Type", "text/plain; charset=utf-8");
    res.sendFile(metadataFile, { dotfiles: "allow" });
  });

  app.get("/oneconnect-token.svg", (_req, res) => {
    res.type("image/svg+xml").sendFile(imageFile);
  });

  app.get("/oneconnect-token.jpg", (_req, res) => {
    res.type("image/jpeg").sendFile(jpegFile);
  });
}
