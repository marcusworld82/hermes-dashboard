import { SocialNav } from "@/components/social/SocialNav";

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SocialNav />
      {children}
    </>
  );
}
