"use client";

import { useStatusPage } from "@/components/status-page/floating-button";

export function OpenAILayoutWrapper({
  openaiShell,
  defaultShell,
}: {
  openaiShell: React.ReactNode;
  defaultShell: React.ReactNode;
  // children is embedded inside openaiShell / defaultShell by the server layout
  children?: React.ReactNode;
}) {
  const { componentLayout } = useStatusPage();
  if (componentLayout === "openai") return openaiShell;
  return defaultShell;
}
