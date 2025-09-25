// src/markets/market-section.enum.ts
export enum MarketSection {
  CARNES_RES = 'CARNES_RES',
  CARNES_CERDO = 'CARNES_CERDO',
  POLLERIA = 'POLLERIA',
  PESCADOS_MARISCOS = 'PESCADOS_MARISCOS',
  CHARCUTERIA_EMBUTIDOS = 'CHARCUTERIA_EMBUTIDOS',

  LACTEOS = 'LACTEOS',
  HUEVOS = 'HUEVOS',
  FRUTAS = 'FRUTAS',
  VERDURAS = 'VERDURAS',
  LEGUMBRES = 'LEGUMBRES',
  GRANOS = 'GRANOS',
  ABARROTES = 'ABARROTES', // misceláneos secos / tienda

  PANADERIA = 'PANADERIA',
  PASTELERIA_REPOSTERIA = 'PASTELERIA_REPOSTERIA',
  BEBIDAS = 'BEBIDAS',
  COMIDAS_PREPARADAS = 'COMIDAS_PREPARADAS', // fondas/comedores
  ESPECIAS_HIERBAS = 'ESPECIAS_HIERBAS',

  FLORES = 'FLORES',
  PLANTAS_VIVERO = 'PLANTAS_VIVERO',

  ARTESANIAS = 'ARTESANIAS',
  TEXTILES_ROPA = 'TEXTILES_ROPA',
  CALZADO = 'CALZADO',
  BAZAR_HOGAR = 'BAZAR_HOGAR',
  FERRETERIA = 'FERRETERIA',

  LIMPIEZA_HOGAR = 'LIMPIEZA_HOGAR',
  COSMETICA_HIGIENE = 'COSMETICA_HIGIENE',
  PAPELERIA = 'PAPELERIA',
  JUGUETERIA = 'JUGUETERIA',

  MASCOTAS = 'MASCOTAS', // accesorios/servicios
  ALIMENTO_MASCOTAS = 'ALIMENTO_MASCOTAS',
}

// src/markets/market-section.enum.ts (mismo archivo)
export const MARKET_SECTION_LABELS: Record<MarketSection, string> = {
  [MarketSection.CARNES_RES]: 'Carnes de res',
  [MarketSection.CARNES_CERDO]: 'Carnes de cerdo',
  [MarketSection.POLLERIA]: 'Pollería',
  [MarketSection.PESCADOS_MARISCOS]: 'Pescados y mariscos',
  [MarketSection.CHARCUTERIA_EMBUTIDOS]: 'Charcutería y embutidos',

  [MarketSection.LACTEOS]: 'Lácteos',
  [MarketSection.HUEVOS]: 'Huevos',
  [MarketSection.FRUTAS]: 'Frutas',
  [MarketSection.VERDURAS]: 'Verduras',
  [MarketSection.LEGUMBRES]: 'Legumbres',
  [MarketSection.GRANOS]: 'Granos',
  [MarketSection.ABARROTES]: 'Abarrotes',

  [MarketSection.PANADERIA]: 'Panadería',
  [MarketSection.PASTELERIA_REPOSTERIA]: 'Pastelería y repostería',
  [MarketSection.BEBIDAS]: 'Bebidas',
  [MarketSection.COMIDAS_PREPARADAS]: 'Comidas preparadas',
  [MarketSection.ESPECIAS_HIERBAS]: 'Especias y hierbas',

  [MarketSection.FLORES]: 'Flores',
  [MarketSection.PLANTAS_VIVERO]: 'Plantas y vivero',

  [MarketSection.ARTESANIAS]: 'Artesanías',
  [MarketSection.TEXTILES_ROPA]: 'Textiles y ropa',
  [MarketSection.CALZADO]: 'Calzado',
  [MarketSection.BAZAR_HOGAR]: 'Bazar y hogar',
  [MarketSection.FERRETERIA]: 'Ferretería',

  [MarketSection.LIMPIEZA_HOGAR]: 'Limpieza del hogar',
  [MarketSection.COSMETICA_HIGIENE]: 'Cosmética e higiene',
  [MarketSection.PAPELERIA]: 'Papelería',
  [MarketSection.JUGUETERIA]: 'Juguetería',

  [MarketSection.MASCOTAS]: 'Mascotas',
  [MarketSection.ALIMENTO_MASCOTAS]: 'Alimento para mascotas',
};
