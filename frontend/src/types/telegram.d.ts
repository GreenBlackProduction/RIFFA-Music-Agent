// Minimal Telegram Mini App types
interface TelegramWebApp {
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  close(): void;
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
