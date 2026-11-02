"use client";

import { NextStudio } from "next-sanity/studio";
import config from "../../../sanity.config";

export function Studio() {
  return <div data-theme="light" className="fixed inset-0 z-50"><NextStudio config={config} /></div>;
}
