import { AssetRepository } from "./assetRepository";
import { ProjectRepository } from "./projectRepository";
import { ObjectUrlRegistry } from "./objectUrls";

/** Durable app-wide store instances. IndexedDB access is lazy per repository. */
export const projectRepository = new ProjectRepository();
export const assetRepository = new AssetRepository();
export const objectUrls = new ObjectUrlRegistry();
