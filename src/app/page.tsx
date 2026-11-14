"use client";

import dynamic from "next/dynamic";

const GoboStage = dynamic(
  () => import("@/components/gobo-stage").then((mod) => mod.GoboStage),
  { ssr: false },
);

export default function Home() {
  return <GoboStage />;
}
