import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { useInquiry } from "@/contexts/InquiryContext";

interface InquiryNavButtonProps {
  variant?: "default" | "oldtimer";
}

const InquiryNavButton = ({ variant = "default" }: InquiryNavButtonProps) => {
  const { inquiryCount } = useInquiry();
  const isOldtimer = variant === "oldtimer";

  return (
    <Link
      to="/anfrage"
      className={`relative p-2 rounded-md transition-colors ${
        isOldtimer
          ? "text-white/90 hover:text-white"
          : "text-foreground hover:text-foreground/80 hover:bg-secondary"
      }`}
      aria-label={`Anfrage (${inquiryCount} Fahrzeuge)`}
      title="Fahrzeug-Anfrage"
    >
      <Mail className="h-5 w-5" />
      {inquiryCount > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center"
          style={{ lineHeight: 1 }}
        >
          {inquiryCount > 9 ? "9+" : inquiryCount}
        </span>
      )}
    </Link>
  );
};

export default InquiryNavButton;
