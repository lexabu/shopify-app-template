import db from "../db.server";

export interface ShopSettings {
  karats: string;
  colorScheme: string;
  bgColor: string;
  textColor: string;
  tickerSpeed: number;
  position: string;
  showChange: boolean;
  currencySymbol: string;
  isActive: boolean;
}

const DEFAULTS: ShopSettings = {
  karats: "24,22,21,18,14",
  colorScheme: "dark",
  bgColor: "#1a1a2e",
  textColor: "#e8d44d",
  tickerSpeed: 50,
  position: "top",
  showChange: true,
  currencySymbol: "$",
  isActive: true,
};

export function getDefaults(): ShopSettings {
  return { ...DEFAULTS };
}

export async function getSettings(shop: string): Promise<ShopSettings> {
  const settings = await db.shopSettings.findUnique({ where: { shop } });
  if (!settings) return { ...DEFAULTS };

  return {
    karats: settings.karats,
    colorScheme: settings.colorScheme,
    bgColor: settings.bgColor,
    textColor: settings.textColor,
    tickerSpeed: settings.tickerSpeed,
    position: settings.position,
    showChange: settings.showChange,
    currencySymbol: settings.currencySymbol,
    isActive: settings.isActive,
  };
}

export async function saveSettings(
  shop: string,
  data: Partial<ShopSettings>,
) {
  return db.shopSettings.upsert({
    where: { shop },
    create: { shop, ...DEFAULTS, ...data },
    update: data,
  });
}
