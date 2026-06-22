// Live-Bearbeitung nutzt die gleiche reiche Maske wie MobileAdCreate.
// Der eigentliche Mode-Wechsel passiert dort über useLocation().pathname.
import MobileAdCreate from "./MobileAdCreate";

export default function MobileAdEditLive() {
  return <MobileAdCreate />;
}
