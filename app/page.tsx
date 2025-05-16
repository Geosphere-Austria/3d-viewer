"use client";

import { SceneViewProvider } from "./providers/scene-view-provider";
import { use } from "react";
import { ResetView } from "./components/ResetView";
import { MODEL_ID } from "./three/config";
import { Maplibre } from "./components/Maplibre";

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const modelId = (use(searchParams).modelId as string) ?? MODEL_ID;

  return (
    <main className="h-screen">
      <SceneViewProvider>
        <div className="flex flex-col h-screen sm:flex-row">
          <div className="sm:hidden p-4 bg-white dark:bg-gray-700 shadow-md flex justify-between items-center">
            <span className="text-lg font-semibold text-gray-700 dark:text-gray-400">
              3D-Viewer
            </span>
          </div>
          <div className="flex-1 flex min-h-0 h-full">
            <div className="relative flex-1">
              <div className="hidden sm:block absolute top-2 right-2">
                <ResetView></ResetView>
              </div>
              <Maplibre modelId={modelId}></Maplibre>
            </div>
          </div>
        </div>
      </SceneViewProvider>
    </main>
  );
}
