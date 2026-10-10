/** Cosmetics are purely visual. They never touch handling (see tests/unit/shop.test.ts). */
export type PaintPattern = 'solid' | 'twoTone' | 'stripe' | 'dots' | 'checker' | 'flames';

export interface PaintDef {
  id: string;
  name: string;
  price: number;
  body: number;
  trim: number;
  accent: number;
  pattern: PaintPattern;
}

export type AccessorySlot = 'roof' | 'hood' | 'front' | 'rear' | 'antenna';

export interface AccessoryDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  slot: AccessorySlot;
}

export const PAINTS: PaintDef[] = [
  { id: 'tomato', name: 'Tomato Classic', price: 0, body: 0xff5a4e, trim: 0xfff2dc, accent: 0x2b3a55, pattern: 'solid' },
  { id: 'mint', name: 'Harbor Mint', price: 350, body: 0x3cc9a7, trim: 0xfff2dc, accent: 0x1d4d5c, pattern: 'twoTone' },
  { id: 'sunflower', name: 'Sunflower', price: 350, body: 0xffc23a, trim: 0x3a2f2a, accent: 0xff6b3d, pattern: 'solid' },
  { id: 'grape', name: 'Grape Soda', price: 500, body: 0x8a5cf0, trim: 0xffe3f6, accent: 0x2e2059, pattern: 'twoTone' },
  { id: 'navy', name: 'Dockside Navy', price: 500, body: 0x2c4a7a, trim: 0xf3e7cf, accent: 0xffb547, pattern: 'stripe' },
  { id: 'bubblegum', name: 'Bubblegum', price: 650, body: 0xff8cc6, trim: 0xffffff, accent: 0x7a3a6a, pattern: 'dots' },
  { id: 'lime', name: 'Lime Zest', price: 650, body: 0x9adf3c, trim: 0x29412a, accent: 0xfff36b, pattern: 'stripe' },
  { id: 'terracotta', name: 'Canyon Clay', price: 800, body: 0xd9693b, trim: 0xf7d9a8, accent: 0x5a2a1a, pattern: 'twoTone' },
  { id: 'cream', name: 'Cream Soda', price: 800, body: 0xfff0d2, trim: 0xe0503f, accent: 0x5b9fd6, pattern: 'twoTone' },
  { id: 'checker', name: 'Finish Line', price: 1100, body: 0xf4f4f0, trim: 0x23262f, accent: 0xff4d4d, pattern: 'checker' },
  { id: 'flames', name: 'Hot Delivery', price: 1300, body: 0x272b38, trim: 0xffb02e, accent: 0xff4a2e, pattern: 'flames' },
  { id: 'neon', name: 'Night Market', price: 1300, body: 0x1d2a4d, trim: 0x3ff2e0, accent: 0xff4fa3, pattern: 'stripe' },
  { id: 'ocean', name: 'Deep Ocean', price: 900, body: 0x1e8fbf, trim: 0xe9f7ff, accent: 0xffd34d, pattern: 'dots' },
  { id: 'gold', name: 'Golden Gnome', price: 3000, body: 0xf2c14e, trim: 0xfff4c9, accent: 0xb07a14, pattern: 'flames' },
];

export const ACCESSORIES: AccessoryDef[] = [
  { id: 'beacon', name: 'Roof Beacon', desc: 'A spinning amber light. Very official.', price: 400, slot: 'roof' },
  { id: 'duck', name: 'Dash Duck', desc: 'A rubber duck navigator glued to the hood.', price: 450, slot: 'hood' },
  { id: 'flag', name: 'Antenna Flag', desc: 'A jaunty pennant that flaps at speed.', price: 300, slot: 'antenna' },
  { id: 'bullbar', name: 'Chunky Bull Bar', desc: 'Chrome tubes for that tough-but-friendly look.', price: 700, slot: 'front' },
  { id: 'spoiler', name: 'Party Spoiler', desc: 'Adds zero downforce and maximum attitude.', price: 650, slot: 'rear' },
  { id: 'horns', name: 'Twin Air Horns', desc: 'Shiny horns on the roof. Honk not included.', price: 550, slot: 'roof' },
  { id: 'crown', name: 'Delivery Crown', desc: 'For the monarch of tall orders.', price: 1500, slot: 'hood' },
];

export const paintById = (id: string): PaintDef => PAINTS.find((p) => p.id === id) ?? PAINTS[0];
export const accessoryById = (id: string): AccessoryDef | undefined => ACCESSORIES.find((a) => a.id === id);
