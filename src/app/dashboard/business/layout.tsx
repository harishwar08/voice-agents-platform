import { SubNav } from "@/components/shell/SubNav";
import { businessInfoNav } from "@/lib/pages";

export default function BusinessLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div>
      <SubNav items={businessInfoNav} />
      {children}
    </div>
  );
}
