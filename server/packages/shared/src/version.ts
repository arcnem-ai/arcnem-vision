import serverPackage from "../../../package.json" with { type: "json" };

// server/package.json holds the Arcnem Vision release version for every service.
export const VISION_VERSION: string = serverPackage.version;
