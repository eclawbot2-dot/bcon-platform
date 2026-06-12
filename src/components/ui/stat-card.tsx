import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color?: "blue" | "gold" | "green" | "purple";
  subtitle?: string;
  href?: string;
}

/**
 * Overflow hardening (owner mandate, propagated cross-platform): long
 * values like "$38,500,000" must NEVER bleed into a neighboring card.
 * - min-w-0 + overflow-hidden on the card root so it can shrink inside
 *   grid/flex tracks instead of inflating them,
 * - min-w-0 on the text wrapper so truncation can engage inside flex,
 * - tabular-nums + truncate (with full value in title) on the value.
 */
export function StatCard({ title, value, icon: Icon, color = "blue", subtitle, href }: StatCardProps) {
  const colors = {
    blue: "bg-blue-50 text-[#1e3a5f]",
    gold: "bg-yellow-50 text-[#c9a227]",
    green: "bg-green-50 text-green-700",
    purple: "bg-purple-50 text-purple-700",
  };

  const content = (
    <div className={cn("card flex min-w-0 items-start gap-4 overflow-hidden", href && "hover:shadow-md transition-shadow cursor-pointer hover:border-[#1e3a5f] border border-gray-100")}>
      <div className={cn("shrink-0 p-3 rounded-xl", colors[color])}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="min-w-0 truncate text-2xl font-bold tabular-nums text-gray-800" title={String(value)}>{value}</div>
        <div className="text-sm font-medium text-gray-600">{title}</div>
        {subtitle && <div className="text-xs text-gray-400 mt-0.5 break-words">{subtitle}</div>}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className="block min-w-0">{content}</Link>;
  }
  return content;
}
