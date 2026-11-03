import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AudioLift — Your media, better audio",
  description: "Convert your own audio and video files to MP3 locally, and preview YouTube links for authorized extraction.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "AudioLift",
    description: "A thoughtful audio conversion experience.",
    type: "website"
  }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
