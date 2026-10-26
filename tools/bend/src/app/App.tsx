import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { BendProject, MediaAssetRecord } from "../engine/core/types";
import { useEditorStore } from "./store";

const EditorPage = lazy(() => import("../features/editor/EditorPage").then((module) => ({ default: module.EditorPage })));
const IntegrationPage = lazy(() => import("../features/integration/IntegrationPage").then((module) => ({ default: module.IntegrationPage })));

type AppPath = "/" | "/studio" | "/studio/edit" | "/integration";

const BASE_URL = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

function relativePath(pathname: string): string {
  const base = BASE_URL.replace(/\/$/, "");
  if (base && base !== "/" && pathname.startsWith(`${base}/`)) {
    return pathname.slice(base.length) || "/";
  }
  if (pathname === base) return "/";
  return pathname;
}

function appURL(path: string): string {
  return `${BASE_URL}${path.replace(/^\/+/, "")}`;
}

export function App() {
  const [path, setPath] = useState<AppPath>(() => normalizePath(relativePath(window.location.pathname)));
  const setProject = useEditorStore((state) => state.setProject);

  useEffect(() => {
    const handlePopState = () => setPath(normalizePath(relativePath(window.location.pathname)));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    window.history.pushState({}, "", appURL(nextPath));
    setPath(normalizePath(relativePath(window.location.pathname)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const openIntegration = useCallback(() => navigate("/integration"), [navigate]);
  const openHostProject = useCallback((project: BendProject, assets: Record<string, MediaAssetRecord>, urls: Record<string, string>, sessionId: string, layerId: string, sourceVersion: string) => {
    setProject(project, assets, urls);
    navigate(`/studio/edit?hostSession=${encodeURIComponent(sessionId)}&hostLayer=${encodeURIComponent(layerId)}&hostVersion=${encodeURIComponent(sourceVersion)}`);
  }, [navigate, setProject]);

  const hostSession = path === "/studio/edit" ? new URLSearchParams(window.location.search).get("hostSession") : null;
  const hostLayer = path === "/studio/edit" ? new URLSearchParams(window.location.search).get("hostLayer") : null;
  const hostVersion = path === "/studio/edit" ? new URLSearchParams(window.location.search).get("hostVersion") : null;

  if (path === "/" || path === "/studio" || path === "/studio/edit") {
    const returnToHost = Boolean(hostSession && hostLayer);
    return <Suspense fallback={<main className="editor-page editor-loading"><div className="canvas-overlay-note">Opening local studio…</div></main>}><EditorPage hostContext={returnToHost ? { sessionId: hostSession!, layerId: hostLayer!, sourceVersion: hostVersion } : null} onExit={returnToHost ? openIntegration : () => navigate("/")} onNavigateHome={returnToHost ? openIntegration : () => navigate("/")} onHostUpdated={openIntegration} /></Suspense>;
  }
  if (path === "/integration") {
    return <Suspense fallback={<main className="entry-page"><div className="canvas-overlay-note">Opening integration harness…</div></main>}><IntegrationPage onBack={() => navigate("/")} onOpenEditor={openHostProject} /></Suspense>;
  }
  return null;
}

function normalizePath(pathname: string): AppPath {
  if (pathname === "/studio/edit") return "/studio/edit";
  if (pathname === "/studio") return "/studio";
  if (pathname === "/integration") return "/integration";
  return "/";
}

