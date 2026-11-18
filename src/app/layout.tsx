import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { goboFontClassName } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "GoboBlast",
  description: "Project a text gobo onto a pure black stage for a floor or wall.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${goboFontClassName} gobo-hide-cursor h-full`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'if(!location.pathname.endsWith("/"))location.replace(location.pathname+"/"+location.search+location.hash)',
          }}
        />
        <link rel="icon" href="./favicon.ico" />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
